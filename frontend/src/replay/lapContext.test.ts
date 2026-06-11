import { describe, it, expect } from "vitest";
import { deriveLapFacts, buildLapTickRequest, stintHistoryForLap } from "./lapContext";
import type { ReplayMemory } from "./lapContext";
import type { LapData } from "@/types";

function lap(partial: Partial<LapData> & { lapNumber: number }): LapData {
  return {
    lapTimeSeconds: 92,
    compound: 1,
    compoundStr: "MEDIUM",
    tyreAge: 5,
    position: 4,
    gapAhead: 2,
    gapBehind: 1.5,
    safetyCarActive: false,
    pittedThisLap: false,
    isInlap: false,
    isOutlap: false,
    ...partial,
  } as LapData;
}

function freshMemory(): ReplayMemory {
  return {
    prevRainfall: undefined,
    prevPosition: null,
    prevScActive: false,
    scDurationLaps: 0,
    raceFinished: false,
  };
}

describe("deriveLapFacts", () => {
  const laps = [
    lap({ lapNumber: 1, tyreAge: 1 }),
    lap({ lapNumber: 2, tyreAge: 2 }),
    lap({ lapNumber: 3, tyreAge: 3, pittedThisLap: true }),
    lap({ lapNumber: 4, tyreAge: 0, compoundStr: "HARD", compound: 2 }),
    lap({ lapNumber: 5, tyreAge: 1 }),
  ];

  it("returns null for an unknown lap", () => {
    expect(deriveLapFacts(laps, 99, 5, "monza", freshMemory())).toBeNull();
  });

  it("detects pit laps and next compound", () => {
    const facts = deriveLapFacts(laps, 3, 5, "monza", freshMemory())!;
    expect(facts.isActualPitLap).toBe(true);
    expect(facts.nextCompound).toBe("HARD");
    expect(facts.nextCompoundInt).toBe(2);
  });

  it("computes stint number from pit history when missing", () => {
    const facts = deriveLapFacts(laps, 5, 5, "monza", freshMemory())!;
    expect(facts.stintNumber).toBe(2);
  });

  it("flags race end on the final lap", () => {
    const facts = deriveLapFacts(laps, 5, 5, "monza", freshMemory())!;
    expect(facts.isRaceEnd).toBe(true);
    expect(facts.lapsRemaining).toBe(0);
  });

  it("does not re-flag race end once finished", () => {
    const mem = { ...freshMemory(), raceFinished: true };
    const facts = deriveLapFacts(laps, 5, 5, "monza", mem)!;
    expect(facts.isRaceEnd).toBe(false);
  });

  it("tracks SC deployment against memory", () => {
    const scLaps = [lap({ lapNumber: 1, safetyCarActive: true })];
    const facts = deriveLapFacts(scLaps, 1, 10, "monza", freshMemory())!;
    expect(facts.scJustDeployed).toBe(true);
    expect(facts.scDurationLaps).toBe(1);
  });

  it("detects position gains via memory", () => {
    const mem = { ...freshMemory(), prevPosition: 6 };
    const facts = deriveLapFacts(laps, 2, 5, "monza", mem)!;
    expect(facts.positionGained).toBe(true);
    expect(facts.positionsGained).toBe(2);
  });
});

describe("buildLapTickRequest", () => {
  const laps = [
    lap({ lapNumber: 1 }),
    lap({ lapNumber: 2, pittedThisLap: true, compoundStr: "SOFT", compound: 0 }),
    lap({ lapNumber: 3, compoundStr: "HARD", compound: 2 }),
  ];

  it("assembles all four request sections", () => {
    const facts = deriveLapFacts(laps, 1, 3, "monza", freshMemory())!;
    const body = buildLapTickRequest({
      facts,
      allLaps: laps,
      lapNumber: 1,
      circuit: "monza",
      year: 2024,
      drsZonesCount: 2,
      mcSimulations: 150,
      recentMessageTypes: ["ROUTINE_PACE_NOTE"],
    });
    expect(body.next_lap.current_state.circuit_id).toBe("monza");
    expect(body.safety_car.lap_number).toBe(1);
    expect(body.strategy.n_simulations).toBe(150);
    expect(body.strategy.state.drs_zones_count).toBe(2);
    expect(body.recent_message_types).toEqual(["ROUTINE_PACE_NOTE"]);
    // Model-derived fields must NOT be set client-side.
    expect(body.strategy.state.sc_probability).toBeUndefined();
    expect(body.engineer_context.predicted_lap_time).toBeUndefined();
  });

  it("overrides recommended action on actual pit laps", () => {
    const facts = deriveLapFacts(laps, 2, 3, "monza", freshMemory())!;
    const body = buildLapTickRequest({
      facts,
      allLaps: laps,
      lapNumber: 2,
      circuit: "monza",
      year: 2024,
      drsZonesCount: 1,
      mcSimulations: 150,
      recentMessageTypes: [],
    });
    expect(body.engineer_context.recommended_action).toBe("PIT_SOFT");
    expect(body.engineer_context.is_actual_pit_lap).toBe(true);
  });

  it("omits recommended action on normal laps", () => {
    const facts = deriveLapFacts(laps, 1, 3, "monza", freshMemory())!;
    const body = buildLapTickRequest({
      facts,
      allLaps: laps,
      lapNumber: 1,
      circuit: "monza",
      year: 2024,
      drsZonesCount: 1,
      mcSimulations: 150,
      recentMessageTypes: [],
    });
    expect(body.engineer_context.recommended_action).toBeUndefined();
  });
});

describe("stintHistoryForLap", () => {
  it("starts history after the previous pit lap", () => {
    const laps = [
      lap({ lapNumber: 1 }),
      lap({ lapNumber: 2, pittedThisLap: true }),
      lap({ lapNumber: 3 }),
      lap({ lapNumber: 4 }),
    ];
    const hist = stintHistoryForLap(laps, 4, 35, 25);
    expect(hist).toHaveLength(1); // only lap 3 (current stint, before lap 4)
  });

  it("returns empty history for an outlap", () => {
    const laps = [lap({ lapNumber: 1 }), lap({ lapNumber: 2, isOutlap: true })];
    expect(stintHistoryForLap(laps, 2, 35, 25)).toHaveLength(0);
  });
});
