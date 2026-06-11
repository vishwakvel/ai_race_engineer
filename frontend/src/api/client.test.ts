import { describe, it, expect } from "vitest";
import { mapLapData } from "./client";

describe("mapLapData", () => {
  it("maps a snake_case backend row", () => {
    const lap = mapLapData({
      lap_number: 12,
      lap_time_seconds: 92.451,
      compound: 0,
      tyre_age: 5,
      position: 3,
      gap_ahead_seconds: 1.2,
      gap_behind_seconds: 0.8,
      safety_car_active: 0,
      pitted_this_lap: 1,
      is_inlap: 0,
      is_outlap: 0,
      circuit_id: "monaco",
      fuel_load_kg: 88.5,
      rainfall: 0,
      track_temp_celsius: 41.5,
    });
    expect(lap).not.toBeNull();
    expect(lap!.lapNumber).toBe(12);
    expect(lap!.lapTimeSeconds).toBeCloseTo(92.451);
    expect(lap!.compoundStr).toBe("SOFT");
    expect(lap!.position).toBe(3);
    expect(lap!.pittedThisLap).toBe(true);
    expect(lap!.safetyCarActive).toBe(false);
    expect(lap!.circuitId).toBe("monaco");
    expect(lap!.fuelLoad).toBeCloseTo(88.5);
    expect(lap!.trackTemp).toBeCloseTo(41.5);
  });

  it("accepts already-camelCase rows", () => {
    const lap = mapLapData({
      lapNumber: 3,
      lapTimeSeconds: 95.1,
      compoundStr: "HARD",
      tyreAge: 2,
      position: 7,
    });
    expect(lap).not.toBeNull();
    expect(lap!.lapNumber).toBe(3);
    expect(lap!.compoundStr).toBe("HARD");
    expect(lap!.compound).toBe(2);
  });

  it("maps legacy 2018 compound names to SOFT", () => {
    for (const name of ["HYPERSOFT", "ULTRASOFT", "SUPERSOFT", "SOFT"]) {
      const lap = mapLapData({ lap_number: 1, compound_str: name });
      expect(lap!.compoundStr).toBe("SOFT");
      expect(lap!.compound).toBe(0);
    }
  });

  it("clamps numeric compound into the 0-4 range", () => {
    expect(mapLapData({ lap_number: 1, compound: 9 })!.compoundStr).toBe(
      "WET"
    );
    expect(mapLapData({ lap_number: 1, compound: -2 })!.compoundStr).toBe(
      "SOFT"
    );
  });

  it("defaults unknown compounds to MEDIUM", () => {
    const lap = mapLapData({ lap_number: 1, compound_str: "BANANA" });
    expect(lap!.compoundStr).toBe("MEDIUM");
    expect(lap!.compound).toBe(1);
  });

  it("returns null for rows without a valid lap number", () => {
    expect(mapLapData(null)).toBeNull();
    expect(mapLapData("nope")).toBeNull();
    expect(mapLapData({})).toBeNull();
    expect(mapLapData({ lap_number: "abc" })).toBeNull();
  });

  it("treats 1/true as truthy flags and everything else as false", () => {
    expect(mapLapData({ lap_number: 1, is_inlap: 1 })!.isInlap).toBe(true);
    expect(mapLapData({ lap_number: 1, is_inlap: true })!.isInlap).toBe(true);
    expect(mapLapData({ lap_number: 1, is_inlap: "1" })!.isInlap).toBe(false);
    expect(mapLapData({ lap_number: 1 })!.isInlap).toBe(false);
  });

  it("normalizes rainfall to 0 or 1", () => {
    expect(mapLapData({ lap_number: 1, rainfall: 1 })!.rainfall).toBe(1);
    expect(mapLapData({ lap_number: 1, rainfall: 0.4 })!.rainfall).toBe(0);
    expect(mapLapData({ lap_number: 1 })!.rainfall).toBe(0);
  });

  it("drops non-finite optional numerics instead of propagating NaN", () => {
    const lap = mapLapData({
      lap_number: 1,
      fuel_load_kg: NaN,
      track_temp_celsius: Infinity,
    });
    expect(lap!.fuelLoad).toBeUndefined();
    expect(lap!.trackTemp).toBeUndefined();
  });
});
