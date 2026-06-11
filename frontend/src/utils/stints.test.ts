import { describe, it, expect } from "vitest";
import { buildStints } from "./stints";
import type { LapData } from "@/types";

function lap(lapNumber: number, compoundStr: string): LapData {
  return {
    lapNumber,
    lapTimeSeconds: 92,
    compound: 0,
    compoundStr,
    tyreAge: 1,
    position: 5,
    gapAhead: 1,
    gapBehind: 1,
    safetyCarActive: false,
    pittedThisLap: false,
    isInlap: false,
    isOutlap: false,
  };
}

describe("buildStints", () => {
  it("returns empty for no laps", () => {
    expect(buildStints([])).toEqual([]);
  });

  it("groups a single-compound race into one stint", () => {
    const stints = buildStints([
      lap(1, "MEDIUM"),
      lap(2, "MEDIUM"),
      lap(3, "MEDIUM"),
    ]);
    expect(stints).toEqual([
      { startLap: 1, endLap: 3, compound: "MEDIUM", length: 3 },
    ]);
  });

  it("splits stints on compound change", () => {
    const stints = buildStints([
      lap(1, "SOFT"),
      lap(2, "SOFT"),
      lap(3, "HARD"),
      lap(4, "HARD"),
      lap(5, "HARD"),
    ]);
    expect(stints).toHaveLength(2);
    expect(stints[0]).toMatchObject({ compound: "SOFT", length: 2 });
    expect(stints[1]).toMatchObject({
      compound: "HARD",
      startLap: 3,
      endLap: 5,
      length: 3,
    });
  });

  it("sorts out-of-order laps before grouping", () => {
    const stints = buildStints([lap(3, "HARD"), lap(1, "SOFT"), lap(2, "SOFT")]);
    expect(stints.map((s) => s.compound)).toEqual(["SOFT", "HARD"]);
  });

  it("handles races that do not start at lap 1 (e.g. Monaco data)", () => {
    const stints = buildStints([lap(3, "SOFT"), lap(4, "SOFT"), lap(5, "MEDIUM")]);
    expect(stints[0]).toMatchObject({ startLap: 3, endLap: 4 });
    expect(stints[1]).toMatchObject({ startLap: 5, endLap: 5 });
  });

  it("re-splits when returning to a previously used compound", () => {
    const stints = buildStints([
      lap(1, "SOFT"),
      lap(2, "MEDIUM"),
      lap(3, "SOFT"),
    ]);
    expect(stints.map((s) => s.compound)).toEqual(["SOFT", "MEDIUM", "SOFT"]);
  });

  it("defaults a missing compound to MEDIUM", () => {
    const stints = buildStints([lap(1, "")]);
    expect(stints[0]!.compound).toBe("MEDIUM");
  });
});
