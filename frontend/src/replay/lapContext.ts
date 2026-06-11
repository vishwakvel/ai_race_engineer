/**
 * Pure derivation of the per-lap model request from replay state.
 * No store access, no fetching — fully unit-testable.
 */

import type { LapData } from "@/types";
import {
  compoundIndex,
  fuelForLap,
  trackEvolution,
  isStreetCircuit,
} from "./lapMath";

/** Mutable replay memory carried between laps (owned by the hook as refs). */
export interface ReplayMemory {
  prevRainfall: number | undefined;
  prevPosition: number | null;
  prevScActive: boolean;
  scDurationLaps: number;
  raceFinished: boolean;
}

export interface LapFacts {
  lap: LapData;
  trackTemp: number;
  airTemp: number;
  trackTempDelta: number;
  windSpeed: number;
  rainfall: number;
  rainfallChanged: boolean;
  positionGained: boolean;
  positionsGained: number;
  stintNumber: number;
  incidentsSoFar: number;
  meanTyreAge: number;
  totalRaceLaps: number;
  lapsRemaining: number;
  isRaceEnd: boolean;
  scJustDeployed: boolean;
  scDurationLaps: number;
  scReason: string;
  scSeverity: "minor" | "moderate" | "major";
  isActualPitLap: boolean;
  nextCompound: string;
  nextCompoundInt: number | undefined;
}

export function deriveLapFacts(
  allLaps: LapData[],
  lapNumber: number,
  storeTotal: number,
  circuit: string,
  memory: ReplayMemory
): LapFacts | null {
  const lap = allLaps.find((l) => l.lapNumber === lapNumber);
  if (!lap) return null;

  const trackTemp = lap.trackTemp ?? 35;
  const airTemp = 25;
  const prevLap = allLaps.find((l) => l.lapNumber === lapNumber - 1);
  const trackTempDelta =
    prevLap?.trackTemp != null && lap.trackTemp != null
      ? lap.trackTemp - prevLap.trackTemp
      : (lap.trackTempDelta ?? 0);
  const windSpeed = lap.windSpeed ?? 0;

  let stintNumber = lap.stintNumber ?? 1;
  if (lap.stintNumber == null) {
    for (let n = 1; n < lapNumber; n++) {
      const l = allLaps.find((x) => x.lapNumber === n);
      if (l?.pittedThisLap || l?.isInlap) stintNumber++;
    }
  }

  const rainfall = lap.rainfall ?? 0;
  const rainfallChanged =
    memory.prevRainfall !== undefined && memory.prevRainfall !== rainfall;
  const positionGained =
    memory.prevPosition !== null && lap.position < memory.prevPosition;
  const positionsGained = positionGained
    ? memory.prevPosition! - lap.position
    : 0;

  const totalRaceLaps =
    storeTotal > 0
      ? storeTotal
      : Math.max(...allLaps.map((l) => l.lapNumber), lapNumber);
  const lapsRemaining = Math.max(0, totalRaceLaps - lapNumber);
  const isRaceEnd =
    (lapsRemaining === 0 || lapNumber >= totalRaceLaps) && !memory.raceFinished;

  const scJustDeployed = !memory.prevScActive && lap.safetyCarActive;
  const scDurationLaps = lap.safetyCarActive ? memory.scDurationLaps + 1 : 0;

  const incidentsSoFar = allLaps.filter(
    (l) => l.lapNumber < lapNumber && l.safetyCarActive
  ).length;
  const lapsSoFar = allLaps.filter((l) => l.lapNumber <= lapNumber);
  const meanTyreAge =
    lapsSoFar.reduce((a, l) => a + l.tyreAge, 0) / Math.max(1, lapsSoFar.length);

  const street = isStreetCircuit(circuit);
  let scReason = "incident ahead";
  if (scJustDeployed) {
    if (lapNumber <= 3) scReason = "first-lap incident";
    else if (street) scReason = "incident on circuit";
    else if (rainfall === 1 || rainfallChanged)
      scReason = "weather incident — wet track";
  }

  let scSeverity: "minor" | "moderate" | "major" = "moderate";
  if (scDurationLaps <= 1 && (lapNumber <= 3 || rainfall === 1)) scSeverity = "major";
  else if (scDurationLaps >= 4 || street) scSeverity = "major";
  else if (scDurationLaps <= 2) scSeverity = "minor";

  const isActualPitLap = lap.pittedThisLap || lap.isInlap;
  const nextLapData = allLaps.find((l) => l.lapNumber === lapNumber + 1);
  const nextCompound = nextLapData?.compoundStr ?? lap.compoundStr;
  const nextCompoundInt = isActualPitLap
    ? nextLapData != null
      ? compoundIndex(nextLapData)
      : undefined
    : undefined;

  return {
    lap,
    trackTemp,
    airTemp,
    trackTempDelta,
    windSpeed,
    rainfall,
    rainfallChanged,
    positionGained,
    positionsGained,
    stintNumber,
    incidentsSoFar,
    meanTyreAge,
    totalRaceLaps,
    lapsRemaining,
    isRaceEnd,
    scJustDeployed,
    scDurationLaps,
    scReason,
    scSeverity,
    isActualPitLap,
    nextCompound,
    nextCompoundInt,
  };
}

/** Stint-local lap history feeding the LSTM sequence input. */
export function stintHistoryForLap(
  allLaps: LapData[],
  lapNumber: number,
  trackTemp: number,
  airTemp: number
): Record<string, unknown>[] {
  const get = (n: number) => allLaps.find((l) => l.lapNumber === n);
  let start = 1;
  if (get(lapNumber)?.isOutlap) start = lapNumber;
  else {
    for (let n = lapNumber - 1; n >= 1; n--) {
      const l = get(n);
      if (l?.pittedThisLap) {
        start = n + 1;
        break;
      }
    }
  }
  const totalLapsForRace =
    allLaps.length > 0 ? Math.max(...allLaps.map((x) => x.lapNumber)) : 57;
  const hist: Record<string, unknown>[] = [];
  for (let n = start; n < lapNumber; n++) {
    const l = get(n);
    if (!l) continue;
    hist.push({
      lap_time_seconds: l.lapTimeSeconds,
      compound: compoundIndex(l),
      tyre_age: l.tyreAge,
      fuel_load_kg: fuelForLap({ lapNumber: n, fuelLoad: l.fuelLoad }),
      track_temp_celsius: l.trackTemp ?? trackTemp,
      air_temp_celsius: airTemp,
      gap_ahead_seconds: l.gapAhead,
      gap_behind_seconds: l.gapBehind,
      safety_car_active: l.safetyCarActive ? 1 : 0,
      wind_speed: l.windSpeed ?? 0,
      fresh_tyre: l.freshTyre ?? (l.tyreAge <= 1 ? 1 : 0),
      track_evolution_index: trackEvolution(n, totalLapsForRace),
    });
  }
  return hist;
}

export interface LapTickRequestBody {
  next_lap: {
    stint_laps: Record<string, unknown>[];
    current_state: Record<string, unknown>;
  };
  safety_car: Record<string, unknown>;
  strategy: {
    state: Record<string, unknown>;
    run_monte_carlo: boolean;
    n_simulations: number;
  };
  engineer_context: Record<string, unknown>;
  recent_message_types: string[];
}

export function buildLapTickRequest(args: {
  facts: LapFacts;
  allLaps: LapData[];
  lapNumber: number;
  circuit: string;
  year: number;
  drsZonesCount: number;
  mcSimulations: number;
  recentMessageTypes: string[];
}): LapTickRequestBody {
  const {
    facts,
    allLaps,
    lapNumber,
    circuit,
    year,
    drsZonesCount,
    mcSimulations,
    recentMessageTypes,
  } = args;
  const { lap, totalRaceLaps } = facts;

  const currentState: Record<string, unknown> = {
    compound: compoundIndex(lap),
    tyre_age: lap.tyreAge,
    fuel_load_kg: fuelForLap(lap),
    track_temp_celsius: facts.trackTemp,
    air_temp_celsius: facts.airTemp,
    gap_ahead_seconds: lap.gapAhead,
    gap_behind_seconds: lap.gapBehind,
    safety_car_active: lap.safetyCarActive ? 1 : 0,
    circuit_id: circuit,
    track_evolution_index: trackEvolution(lapNumber, totalRaceLaps),
    wind_speed: facts.windSpeed,
    fresh_tyre: lap.freshTyre ?? (lap.tyreAge <= 1 ? 1 : 0),
    stint_number: facts.stintNumber,
    lap_number: lapNumber,
    laps_remaining: facts.lapsRemaining,
    rainfall: facts.rainfall,
    total_laps: totalRaceLaps,
    track_temp_delta: facts.trackTempDelta,
  };

  // sc_probability / cliff_probability are injected server-side from the
  // phase-1 model outputs inside /race/lap_tick.
  const rlState: Record<string, unknown> = {
    lap_number: lapNumber,
    laps_remaining: facts.lapsRemaining,
    total_laps: totalRaceLaps,
    position: lap.position,
    compound: compoundIndex(lap),
    tyre_age: lap.tyreAge,
    fuel_load_kg: fuelForLap(lap),
    gap_ahead_seconds: lap.gapAhead,
    gap_behind_seconds: lap.gapBehind,
    soft_available: 1,
    hard_available: 1,
    circuit_id: circuit,
    track_evolution_index: trackEvolution(lapNumber, totalRaceLaps),
    stint_number: facts.stintNumber,
    drs_zones_count: drsZonesCount,
    next_compound: facts.nextCompoundInt,
    year,
    rainfall: facts.rainfall,
    wind_speed: facts.windSpeed,
    track_temp_delta: facts.trackTempDelta,
    track_temp_celsius: facts.trackTemp,
    air_temp_celsius: facts.airTemp,
    mean_tyre_age_field: facts.meanTyreAge,
  };

  const circuitLabel = circuit.replace(/_/g, " ").toUpperCase();
  const engineerContext: Record<string, unknown> = {
    circuit_name: circuitLabel,
    lap_number: lapNumber,
    total_laps: totalRaceLaps,
    position: lap.position,
    compound: lap.compoundStr,
    tyre_age: lap.tyreAge,
    gap_ahead: lap.gapAhead,
    gap_behind: lap.gapBehind,
    sc_active: lap.safetyCarActive,
    is_race_start: lapNumber <= 2,
    starting_compound: lap.compoundStr,
    is_actual_pit_lap: facts.isActualPitLap,
    next_compound: facts.isActualPitLap ? facts.nextCompound : null,
    track_evolution_index: trackEvolution(lapNumber, totalRaceLaps),
    rainfall: facts.rainfall,
    track_temp: facts.trackTemp,
    rainfall_changed: facts.rainfallChanged,
    position_gained: facts.positionGained,
    positions_gained: facts.positionsGained,
    is_race_end: facts.isRaceEnd,
    final_position: facts.isRaceEnd ? lap.position : undefined,
    sc_just_deployed: facts.scJustDeployed,
    sc_duration_laps: facts.scDurationLaps,
    sc_reason: facts.scReason,
    sc_severity: facts.scSeverity,
    drs_zones_count: drsZonesCount,
    track_temp_delta: facts.trackTempDelta,
    wind_speed: facts.windSpeed,
  };
  if (facts.isActualPitLap) {
    // Historical replay truth beats the PPO suggestion on actual pit laps.
    const comp = lap.compoundStr.toUpperCase();
    engineerContext.recommended_action = `PIT_${
      comp === "SOFT" ? "SOFT" : comp === "HARD" ? "HARD" : "MEDIUM"
    }`;
  }

  return {
    next_lap: {
      stint_laps: stintHistoryForLap(
        allLaps,
        lapNumber,
        facts.trackTemp,
        facts.airTemp
      ),
      current_state: currentState,
    },
    safety_car: {
      lap_number: lapNumber,
      laps_remaining: facts.lapsRemaining,
      circuit,
      track_temp_celsius: facts.trackTemp,
      air_temp_celsius: facts.airTemp,
      rainfall: facts.rainfall,
      incidents_so_far: facts.incidentsSoFar,
      cars_within_2s: lap.gapBehind < 2 && lap.gapBehind >= 0 ? 3 : 2,
      mean_tyre_age_field: facts.meanTyreAge,
      year,
      wind_speed: facts.windSpeed,
      track_temp_delta: facts.trackTempDelta,
      tyre_age: lap.tyreAge,
      compound: compoundIndex(lap),
    },
    strategy: {
      state: rlState,
      run_monte_carlo: true,
      n_simulations: mcSimulations,
    },
    engineer_context: engineerContext,
    recent_message_types: recentMessageTypes,
  };
}
