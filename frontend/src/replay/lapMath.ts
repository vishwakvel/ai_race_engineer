import type { LapData } from "@/types";

/** Clamp the parquet compound code into the model's valid 0–4 range. */
export function compoundIndex(lap: LapData): number {
  const c = lap.compound;
  if (typeof c === "number" && c >= 0 && c <= 4) return c;
  return 1;
}

export function normalizeUrgency(u: string): "ROUTINE" | "ADVISORY" | "URGENT" {
  const x = (u || "").toUpperCase();
  if (x === "URGENT" || x === "ADVISORY" || x === "ROUTINE") return x;
  return "ROUTINE";
}

/** Fuel estimate: real value when telemetry has it, linear burn otherwise. */
export function fuelForLap(lap: { lapNumber: number; fuelLoad?: number }): number {
  if (lap.fuelLoad != null && Number.isFinite(lap.fuelLoad)) {
    return Math.max(0, lap.fuelLoad);
  }
  return Math.max(0, 110 - lap.lapNumber * 1.6);
}

/** Sigmoid track grip evolution over race distance (matches training feature). */
export function trackEvolution(lapNum: number, total: number): number {
  const progress = lapNum / Math.max(total, 1);
  return 0.85 / (1 + Math.exp(-12 * (progress - 0.25)));
}

const STREET_CIRCUITS = [
  "monaco",
  "monte_carlo",
  "marina_bay",
  "singapore",
  "baku",
  "miami",
  "las_vegas",
  "jeddah",
];

export function isStreetCircuit(circuit: string): boolean {
  return STREET_CIRCUITS.includes(circuit);
}
