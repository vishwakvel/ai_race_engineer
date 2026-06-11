import { describe, it, expect, beforeEach } from "vitest";
import { useRaceStore } from "./raceStore";

const initial = useRaceStore.getState();

beforeEach(() => {
  useRaceStore.setState(initial, true);
});

describe("raceStore", () => {
  it("resetRace clears race data but keeps the selected race", () => {
    useRaceStore.setState({
      selectedRace: { year: 2024, round: 8, circuit: "monaco" },
      currentLap: 20,
      raceLoaded: true,
      messages: [
        {
          id: "m1",
          message: "Box box.",
          urgency: "URGENT",
          lapNumber: 20,
          timestamp: "t",
        },
      ],
      pitEvents: [{ lap: 18, compound: "HARD" }],
    });

    useRaceStore.getState().resetRace();
    const s = useRaceStore.getState();
    expect(s.currentLap).toBe(0);
    expect(s.raceLoaded).toBe(false);
    expect(s.messages).toEqual([]);
    expect(s.pitEvents).toEqual([]);
    expect(s.selectedRace).toEqual({ year: 2024, round: 8, circuit: "monaco" });
  });

  it("addMessage prepends (newest first)", () => {
    const add = useRaceStore.getState().addMessage;
    add({ id: "a", message: "first", urgency: "ROUTINE", lapNumber: 1, timestamp: "t" });
    add({ id: "b", message: "second", urgency: "ROUTINE", lapNumber: 2, timestamp: "t" });
    expect(useRaceStore.getState().messages.map((m) => m.id)).toEqual(["b", "a"]);
  });

  it("clearReplayState resets per-replay fields but keeps loaded laps", () => {
    useRaceStore.setState({
      currentLap: 30,
      lapElapsedSeconds: 45,
      allLaps: [{ lapNumber: 1 } as never],
      lstmOutput: { predictedLapTime: 92, degRate: 0.1, cliffProb: 0.05 },
    });
    useRaceStore.getState().clearReplayState();
    const s = useRaceStore.getState();
    expect(s.currentLap).toBe(0);
    expect(s.lapElapsedSeconds).toBe(0);
    expect(s.lstmOutput).toBeNull();
    expect(s.allLaps).toHaveLength(1);
  });

  it("setLapElapsedSeconds clamps negatives to zero", () => {
    useRaceStore.getState().setLapElapsedSeconds(-5);
    expect(useRaceStore.getState().lapElapsedSeconds).toBe(0);
  });

  it("bumpRaceLoadSeq increments monotonically", () => {
    const before = useRaceStore.getState().raceLoadSeq;
    useRaceStore.getState().bumpRaceLoadSeq();
    useRaceStore.getState().bumpRaceLoadSeq();
    expect(useRaceStore.getState().raceLoadSeq).toBe(before + 2);
  });
});
