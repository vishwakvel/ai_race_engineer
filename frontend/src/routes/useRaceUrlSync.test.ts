import { describe, it, expect } from "vitest";
import { raceSessionPath } from "./useRaceUrlSync";

describe("raceSessionPath", () => {
  it("builds base path without lap query", () => {
    expect(raceSessionPath(2024, 8)).toBe("/race/2024/8");
  });

  it("includes lap query when lap > 0", () => {
    expect(raceSessionPath(2024, 8, 33)).toBe("/race/2024/8?lap=33");
  });

  it("omits lap query for lap 0 or negative", () => {
    expect(raceSessionPath(2024, 8, 0)).toBe("/race/2024/8");
    expect(raceSessionPath(2024, 8, -1)).toBe("/race/2024/8");
  });
});
