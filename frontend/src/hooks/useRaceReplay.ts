import { useState, useEffect, useRef, useCallback } from "react";
import { useRaceStore } from "@/store/raceStore";
import { apiClient } from "@/api/client";
import type { LapData, LstmOutput, XgbOutput, PpoOutput } from "@/types";

function compoundIndex(lap: LapData): number {
  const c = lap.compound;
  if (typeof c === "number" && c >= 0 && c <= 4) return c;
  return 1;
}

function normalizeUrgency(u: string): "ROUTINE" | "ADVISORY" | "URGENT" {
  const x = (u || "").toUpperCase();
  if (x === "URGENT" || x === "ADVISORY" || x === "ROUTINE") return x;
  return "ROUTINE";
}

function fuelForLap(lap: { lapNumber: number; fuelLoad?: number }): number {
  if (lap.fuelLoad != null && Number.isFinite(lap.fuelLoad)) {
    return Math.max(0, lap.fuelLoad);
  }
  return Math.max(0, 110 - lap.lapNumber * 1.6);
}

function trackEvolution(lapNum: number, total: number): number {
  const progress = lapNum / Math.max(total, 1);
  return 0.85 / (1 + Math.exp(-12 * (progress - 0.25)));
}

export function useRaceReplay() {
  const raceLoadSeq = useRaceStore((s) => s.raceLoadSeq);
  const setCurrentLap = useRaceStore((s) => s.setCurrentLap);
  const setModelOutputs = useRaceStore((s) => s.setModelOutputs);
  const addMessage = useRaceStore((s) => s.addMessage);
  const addPitEvent = useRaceStore((s) => s.addPitEvent);
  const currentLap = useRaceStore((s) => s.currentLap);
  const allLaps = useRaceStore((s) => s.allLaps);
  const lapElapsedSeconds = useRaceStore((s) => s.lapElapsedSeconds);
  const setLapElapsedSeconds = useRaceStore((s) => s.setLapElapsedSeconds);

  const [isPlaying, setIsPlaying] = useState(false);
  /** Sim seconds per real second: 1 = real-time, 2 and 5 = faster. */
  const [intraLapSpeed, setIntraLapSpeed] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  const lapLockRef = useRef(false);
  const recentMessageTypesRef = useRef<string[]>([]);
  const prevRainfallRef = useRef<number | undefined>(undefined);
  const prevPositionRef = useRef<number | null>(null);
  const raceFinishedRef = useRef(false);
  const scDurationRef = useRef(0);
  const prevScActiveRef = useRef(false);
  const stintHistoryForLap = (
    allLaps: LapData[],
    lapNumber: number,
    trackTemp: number,
    airTemp: number
  ): Record<string, unknown>[] => {
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
        fuel_load_kg: fuelForLap({ lapNumber: n, fuelLoad: get(n)?.fuelLoad }),
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
  };

  const processLap = useCallback(async (lapNumber: number) => {
    const { allLaps, selectedRace, totalLaps: storeTotal } = useRaceStore.getState();
    if (!allLaps.length) return;

    const lap = allLaps.find((l) => l.lapNumber === lapNumber);
    if (!lap) return;

    const trackTemp = lap.trackTemp ?? 35;
    const airTemp = 25;
    const prevLap = allLaps.find((l) => l.lapNumber === lapNumber - 1);
    const trackTempDelta =
      prevLap?.trackTemp != null && lap.trackTemp != null
        ? lap.trackTemp - prevLap.trackTemp
        : lap.trackTempDelta ?? 0;
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
      prevRainfallRef.current !== undefined && prevRainfallRef.current !== rainfall;
    const positionGained =
      prevPositionRef.current !== null && lap.position < prevPositionRef.current;
    const positionsGained = positionGained
      ? prevPositionRef.current! - lap.position
      : 0;
    const totalRaceLapsEarly = storeTotal > 0 ? storeTotal : Math.max(...allLaps.map((l) => l.lapNumber), lapNumber);
    const lapsRemaining = Math.max(0, totalRaceLapsEarly - lapNumber);
    const isRaceEnd = (lapsRemaining === 0 || lapNumber >= totalRaceLapsEarly) && !raceFinishedRef.current;
    if (isRaceEnd) raceFinishedRef.current = true;
    const scJustDeployed = !prevScActiveRef.current && lap.safetyCarActive;
    if (lap.safetyCarActive) scDurationRef.current += 1;
    else scDurationRef.current = 0;

    const stintLaps = stintHistoryForLap(allLaps, lapNumber, trackTemp, airTemp);

    const circuit = (selectedRace?.circuit || (allLaps[0] as { circuitId?: string })?.circuitId || "bahrain").toLowerCase().replace(/-/g, "_");
    const totalRaceLaps = totalRaceLapsEarly;

    setIsLoading(true);
    try {
      const currentState = {
        compound: compoundIndex(lap),
        tyre_age: lap.tyreAge,
        fuel_load_kg: fuelForLap(lap),
        track_temp_celsius: trackTemp,
        air_temp_celsius: airTemp,
        gap_ahead_seconds: lap.gapAhead,
        gap_behind_seconds: lap.gapBehind,
        safety_car_active: lap.safetyCarActive ? 1 : 0,
        circuit_id: circuit,
        track_evolution_index: trackEvolution(lapNumber, totalRaceLaps),
        wind_speed: windSpeed,
        fresh_tyre: lap.freshTyre ?? (lap.tyreAge <= 1 ? 1 : 0),
        stint_number: stintNumber,
        lap_number: lapNumber,
        laps_remaining: Math.max(0, totalRaceLaps - lapNumber),
        rainfall,
        total_laps: totalRaceLaps,
        track_temp_delta: trackTempDelta,
      };

      let lstmRaw = {
        predicted_lap_time: 92.0,
        deg_rate: 0.15,
        cliff_probability: 0.05,
        weather_condition: "dry" as string,
        weather_advisory: null as string | null,
        rain_risk_trend: "stable" as string,
      };
      try {
        const lapRes = await apiClient.predictNextLap({
          stint_laps: stintLaps.slice(-10) as Record<string, unknown>[],
          current_state: currentState,
        });
        lstmRaw = {
          predicted_lap_time: lapRes.predicted_lap_time ?? 92,
          deg_rate: lapRes.deg_rate ?? 0.15,
          cliff_probability: lapRes.cliff_probability ?? 0.05,
          weather_condition: lapRes.weather_condition ?? "dry",
          weather_advisory: lapRes.weather_advisory ?? null,
          rain_risk_trend: lapRes.rain_risk_trend ?? "stable",
        };
      } catch (e) {
        console.error("[processLap] LSTM failed:", e);
      }

      const incidentsSoFar = allLaps.filter(
      (l) => l.lapNumber < lapNumber && l.safetyCarActive
    ).length;

    let xgbRaw = {
      sc_probability: 0.05,
      top_shap_factors: [] as { feature?: string; impact?: number }[],
      vsc_ratio: 0.35,
    };
    const meanTyreAge =
      allLaps
        .filter((l) => l.lapNumber <= lapNumber)
        .reduce((a, l) => a + l.tyreAge, 0) /
      Math.max(1, allLaps.filter((l) => l.lapNumber <= lapNumber).length);
    try {
      const scRes = await apiClient.predictSafetyCar({
        lap_number: lapNumber,
        laps_remaining: Math.max(0, totalRaceLaps - lapNumber),
        circuit,
        track_temp_celsius: trackTemp,
        air_temp_celsius: airTemp,
        rainfall,
        incidents_so_far: incidentsSoFar,
        cars_within_2s: lap.gapBehind < 2 && lap.gapBehind >= 0 ? 3 : 2,
        mean_tyre_age_field: meanTyreAge,
        year: selectedRace?.year ?? 2024,
        wind_speed: windSpeed,
        track_temp_delta: trackTempDelta,
        tyre_age: lap.tyreAge,
        compound: compoundIndex(lap),
      });
      xgbRaw = {
        sc_probability: scRes.sc_probability ?? 0.05,
        top_shap_factors: scRes.top_shap_factors ?? [],
        vsc_ratio: scRes.vsc_ratio ?? 0.35,
      };
    } catch (e) {
      console.error("[processLap] XGB failed:", e);
    }

    let drsZonesCount = 1;
    try {
      const trackMap = await apiClient.getTrackMap(circuit);
      drsZonesCount = trackMap.drs_zones_count ?? 1;
    } catch {
      /* ignore */
    }
    const nextLapForCompound = allLaps.find((l) => l.lapNumber === lapNumber + 1);
    const nextCompoundInt =
      lap.pittedThisLap || lap.isInlap
        ? nextLapForCompound != null
          ? compoundIndex(nextLapForCompound)
          : undefined
        : undefined;

    const scProb = xgbRaw.sc_probability;
    const cliffProb = lstmRaw.cliff_probability;

    const rlState: Record<string, unknown> = {
      lap_number: lapNumber,
      laps_remaining: Math.max(0, totalRaceLaps - lapNumber),
      total_laps: totalRaceLaps,
      position: lap.position,
      compound: compoundIndex(lap),
      tyre_age: lap.tyreAge,
      fuel_load_kg: fuelForLap(lap),
      gap_ahead_seconds: lap.gapAhead,
      gap_behind_seconds: lap.gapBehind,
      sc_probability: scProb,
      cliff_probability: cliffProb,
      soft_available: 1,
      hard_available: 1,
      circuit_id: circuit,
      track_evolution_index: trackEvolution(lapNumber, totalRaceLaps),
      stint_number: stintNumber,
      drs_zones_count: drsZonesCount,
      next_compound: nextCompoundInt,
      year: selectedRace?.year ?? 2024,
      rainfall,
      wind_speed: windSpeed,
      track_temp_delta: trackTempDelta,
      track_temp_celsius: trackTemp,
      air_temp_celsius: airTemp,
      mean_tyre_age_field: meanTyreAge,
    };

    let ppoRaw = {
      recommended_action: "STAY_OUT",
      action_confidence: 0.5,
      pit_window_laps: null as number[] | null,
      finishing_distribution: {} as Record<string, number>,
      median_finish: lap.position,
      p10_finish: Math.max(1, lap.position - 2),
      p90_finish: lap.position + 3,
    };
    try {
      ppoRaw = await apiClient.recommendStrategy({
        state: rlState,
        run_monte_carlo: true,
        n_simulations: 500,
      });
    } catch (e) {
      console.error("[processLap] PPO failed:", e);
    }

    const lstm: LstmOutput = {
      predictedLapTime: lstmRaw.predicted_lap_time,
      degRate: lstmRaw.deg_rate,
      cliffProb: lstmRaw.cliff_probability,
    };
    const xgb: XgbOutput = {
      scProbability: xgbRaw.sc_probability,
      topShapFactors: (xgbRaw.top_shap_factors || []).map((f) => ({
        feature: String(f.feature ?? ""),
        impact: Number(f.impact ?? 0),
      })),
    };
    const pitWin =
      ppoRaw.pit_window_laps && ppoRaw.pit_window_laps.length >= 2
        ? ([ppoRaw.pit_window_laps[0], ppoRaw.pit_window_laps[1]] as [
            number,
            number,
          ])
        : null;
    const ppo: PpoOutput = {
      action: ppoRaw.recommended_action,
      recommendedAction: ppoRaw.recommended_action,
      confidence: ppoRaw.action_confidence ?? 0.5,
      pitWindow: pitWin,
      finishingDistribution: ppoRaw.finishing_distribution ?? {},
      medianFinish: ppoRaw.median_finish ?? lap.position,
      p10Finish: ppoRaw.p10_finish ?? Math.max(1, lap.position - 2),
      p90Finish: ppoRaw.p90_finish ?? lap.position + 3,
    };

    setModelOutputs(lstm, xgb, ppo);

    const isActualPitLap = lap.pittedThisLap || lap.isInlap;
    const nextLapData = allLaps.find((l) => l.lapNumber === lapNumber + 1);
    const nextCompound = nextLapData?.compoundStr ?? lap.compoundStr;
    if (isActualPitLap) {
      addPitEvent({ lap: lapNumber, compound: nextCompound });
    }

    const streetCircuits = ["monaco", "monte_carlo", "marina_bay", "singapore", "baku", "miami", "las_vegas", "jeddah"];
    const isStreetCircuit = streetCircuits.includes(circuit);
    let scReason = "incident ahead";
    if (scJustDeployed) {
      if (lapNumber <= 3) scReason = "first-lap incident";
      else if (isStreetCircuit) scReason = "incident on circuit";
      else if (rainfall === 1 || rainfallChanged) scReason = "weather incident — wet track";
    }

    let scSeverity: "minor" | "moderate" | "major" = "moderate";
    if (scDurationRef.current <= 1 && (lapNumber <= 3 || rainfall === 1)) scSeverity = "major";
    else if (scDurationRef.current >= 4 || isStreetCircuit) scSeverity = "major";
    else if (scDurationRef.current <= 2) scSeverity = "minor";

    const circuitLabel = circuit.replace(/_/g, " ").toUpperCase();
    const isRaceStart = lapNumber <= 2;
    const engineerContext = {
      circuit_name: circuitLabel,
      lap_number: lapNumber,
      total_laps: totalRaceLaps,
      position: lap.position,
      compound: lap.compoundStr,
      tyre_age: lap.tyreAge,
      predicted_lap_time: lstmRaw.predicted_lap_time,
      deg_rate: lstmRaw.deg_rate,
      cliff_probability: lstmRaw.cliff_probability,
      gap_ahead: lap.gapAhead,
      gap_behind: lap.gapBehind,
      sc_active: lap.safetyCarActive,
      sc_probability: scProb,
      sc_shap_factors: (xgbRaw.top_shap_factors || []).map((f) => f.feature),
      recommended_action: isActualPitLap
        ? `PIT_${lap.compoundStr.toUpperCase() === "SOFT" ? "SOFT" : lap.compoundStr.toUpperCase() === "HARD" ? "HARD" : "MEDIUM"}`
        : ppoRaw.recommended_action,
      action_confidence: ppoRaw.action_confidence,
      median_finish: ppoRaw.median_finish,
      p10_finish: ppoRaw.p10_finish,
      p90_finish: ppoRaw.p90_finish,
      is_race_start: isRaceStart,
      starting_compound: lap.compoundStr,
      is_actual_pit_lap: isActualPitLap,
      next_compound: isActualPitLap ? nextCompound : null,
      track_evolution_index: trackEvolution(lapNumber, totalRaceLaps),
      rainfall,
      track_temp: trackTemp,
      rainfall_changed: rainfallChanged,
      position_gained: positionGained,
      positions_gained: positionsGained,
      is_race_end: isRaceEnd,
      final_position: isRaceEnd ? lap.position : undefined,
      sc_just_deployed: scJustDeployed,
      sc_duration_laps: scDurationRef.current,
      sc_reason: scReason,
      sc_severity: scSeverity,
      drs_zones_count: drsZonesCount,
      vsc_ratio: xgbRaw.vsc_ratio ?? 0.35,
      weather_condition: lstmRaw.weather_condition,
      weather_advisory: lstmRaw.weather_advisory,
      rain_risk_trend: lstmRaw.rain_risk_trend,
      track_temp_delta: trackTempDelta,
      wind_speed: windSpeed,
    };

    let engineerResult: {
      message: string;
      urgency: string;
      message_type: string;
    } = {
      message: "Copy that. Monitoring.",
      urgency: "ROUTINE",
      message_type: "ROUTINE_PACE_NOTE",
    };
    try {
      const eng = await apiClient.getEngineerMessage({
        context: engineerContext,
        recent_message_types: recentMessageTypesRef.current,
      });
      engineerResult = {
        message: eng.message,
        urgency: eng.urgency,
        message_type: eng.message_type ?? "ROUTINE_PACE_NOTE",
      };
    } catch (e) {
      console.error("[processLap] Engineer message failed:", e);
    }

    const msgType = engineerResult.message_type;
    recentMessageTypesRef.current = [
      msgType,
      ...recentMessageTypesRef.current,
    ].slice(0, 8);

    addMessage({
      id: `lap-${lapNumber}-${Date.now()}`,
      message: engineerResult.message,
      urgency: normalizeUrgency(engineerResult.urgency),
      lapNumber,
      timestamp: new Date().toISOString(),
      isNew: true,
    });

    prevRainfallRef.current = rainfall;
    prevPositionRef.current = lap.position;
    prevScActiveRef.current = lap.safetyCarActive;
    } catch (e) {
    console.error(`[useRaceReplay] processLap(${lapNumber}) failed:`, e);
  } finally {
    setIsLoading(false);
  }
  }, [setModelOutputs, addMessage, addPitEvent]);

  const nextLap = useCallback(async () => {
    if (lapLockRef.current) return;
    const store = useRaceStore.getState();
    const { allLaps, currentLap } = store;
    const maxLap =
      allLaps.length > 0 ? Math.max(...allLaps.map((l) => l.lapNumber)) : 0;
    if (currentLap >= maxLap) {
      setIsPlaying(false);
      return;
    }
    const next = currentLap + 1;
    lapLockRef.current = true;
    try {
      setIsPlaying(false);
      setLapElapsedSeconds(0);
      setCurrentLap(next);
      await processLap(next);
    } finally {
      lapLockRef.current = false;
    }
  }, [setCurrentLap, processLap, setLapElapsedSeconds]);

  const prevLap = useCallback(() => {
    const { currentLap } = useRaceStore.getState();
    if (currentLap <= 1) return;
    setIsPlaying(false);
    setLapElapsedSeconds(0);
    setCurrentLap(currentLap - 1);
  }, [setCurrentLap, setLapElapsedSeconds]);

  const toggleAutoPlay = useCallback(() => {
    setIsPlaying((p) => {
      if (p) return false;
      const { allLaps: laps, currentLap: L, lapElapsedSeconds: el } =
        useRaceStore.getState();
      const lap = laps.find((x) => x.lapNumber === L);
      const dur = lap?.lapTimeSeconds ?? 0;
      const cap = Math.max(0, Math.floor(dur));
      if (cap >= 30 && el >= cap) setLapElapsedSeconds(0);
      return true;
    });
  }, [setLapElapsedSeconds]);

  useEffect(() => {
    if (!raceLoadSeq) return;
    const laps = useRaceStore.getState().allLaps;
    if (!laps.length) return;
    const { lastReplayBootstrapSeq, markReplayBootstrapped } =
      useRaceStore.getState();
    if (lastReplayBootstrapSeq === raceLoadSeq) return;
    markReplayBootstrapped(raceLoadSeq);
    recentMessageTypesRef.current = [];
    prevRainfallRef.current = undefined;
    prevPositionRef.current = null;
    raceFinishedRef.current = false;
    scDurationRef.current = 0;
    prevScActiveRef.current = false;
    useRaceStore.getState().setLapElapsedSeconds(0);
    useRaceStore.getState().setCurrentLap(1);
    void processLap(1);
  }, [raceLoadSeq, processLap]);

  useEffect(() => {
    if (!isPlaying || isLoading) return;
    const lap = allLaps.find((l) => l.lapNumber === currentLap);
    const dur = lap?.lapTimeSeconds ?? 0;
    const cap = Math.floor(dur);
    if (cap < 25) {
      setIsPlaying(false);
      return;
    }
    const el = useRaceStore.getState().lapElapsedSeconds;
    if (el >= cap) {
      setIsPlaying(false);
      return;
    }
    const ms = Math.max(50, 1000 / intraLapSpeed);
    const timer = window.setTimeout(() => {
      const nextEl = useRaceStore.getState().lapElapsedSeconds + 1;
      const L = useRaceStore.getState().currentLap;
      const lp = useRaceStore.getState().allLaps.find((x) => x.lapNumber === L);
      const d = Math.floor(lp?.lapTimeSeconds ?? 0);
      if (nextEl >= d) {
        useRaceStore.getState().setLapElapsedSeconds(Math.max(0, d));
        setIsPlaying(false);
      } else {
        useRaceStore.getState().setLapElapsedSeconds(nextEl);
      }
    }, ms);
    return () => clearTimeout(timer);
  }, [
    isPlaying,
    isLoading,
    intraLapSpeed,
    currentLap,
    lapElapsedSeconds,
    allLaps,
  ]);

  const storeTotal = useRaceStore((s) => s.totalLaps);
  const maxLapNum =
    allLaps.length > 0 ? Math.max(...allLaps.map((l) => l.lapNumber)) : 0;
  const displayTotal =
    storeTotal > 0 ? storeTotal : maxLapNum || allLaps.length;

  const currentLapData = allLaps.find((l) => l.lapNumber === currentLap);
  const currentLapDuration =
    currentLapData && currentLapData.lapTimeSeconds >= 25
      ? currentLapData.lapTimeSeconds
      : 0;

  return {
    currentLap,
    totalLaps: displayTotal,
    lastDataLap: maxLapNum,
    isPlaying,
    isLoading,
    playbackSpeed: intraLapSpeed,
    lapElapsedSeconds,
    currentLapDuration,
    nextLap,
    prevLap,
    toggleAutoPlay,
    setPlaybackSpeed: setIntraLapSpeed,
    processLap,
  };
}
