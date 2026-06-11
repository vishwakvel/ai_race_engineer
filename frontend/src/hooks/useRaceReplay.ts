import { useState, useEffect, useRef, useCallback } from "react";
import { useRaceStore } from "@/store/raceStore";
import { apiClient } from "@/api/client";
import { queryClient } from "@/api/queryClient";
import { trackMapQuery } from "@/api/queries";
import { normalizeUrgency } from "@/replay/lapMath";
import { playbackClock } from "@/replay/playbackClock";
import {
  deriveLapFacts,
  buildLapTickRequest,
  type ReplayMemory,
} from "@/replay/lapContext";
import type { LstmOutput, XgbOutput, PpoOutput } from "@/types";

/**
 * Monte Carlo runs per lap step. The finishing-position distribution is
 * stable well below the API cap of 500; 150 keeps lap stepping responsive
 * while preserving p10/p50/p90 fidelity.
 */
const MC_SIMULATIONS_PER_LAP = 150;

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
  /** Continuous playback: auto-advance to the next lap when one completes. */
  const [raceMode, setRaceMode] = useState(false);
  const raceModeRef = useRef(false);

  useEffect(() => {
    raceModeRef.current = raceMode;
  }, [raceMode]);

  const lapLockRef = useRef(false);
  const recentMessageTypesRef = useRef<string[]>([]);
  const memoryRef = useRef<ReplayMemory>({
    prevRainfall: undefined,
    prevPosition: null,
    prevScActive: false,
    scDurationLaps: 0,
    raceFinished: false,
  });

  const processLap = useCallback(
    async (lapNumber: number) => {
      const {
        allLaps,
        selectedRace,
        totalLaps: storeTotal,
      } = useRaceStore.getState();
      if (!allLaps.length) return;

      const circuit = (
        selectedRace?.circuit ||
        (allLaps[0] as { circuitId?: string })?.circuitId ||
        "bahrain"
      )
        .toLowerCase()
        .replace(/-/g, "_");

      const facts = deriveLapFacts(
        allLaps,
        lapNumber,
        storeTotal,
        circuit,
        memoryRef.current
      );
      if (!facts) return;
      const { lap } = facts;
      if (facts.isRaceEnd) memoryRef.current.raceFinished = true;
      memoryRef.current.scDurationLaps = facts.scDurationLaps;

      setIsLoading(true);
      try {
        // DRS zone count comes from the (forever-cached) track map.
        let drsZonesCount = 1;
        try {
          const trackMap = await queryClient.fetchQuery(trackMapQuery(circuit));
          drsZonesCount = trackMap.drs_zones_count ?? 1;
        } catch {
          /* ignore — fallback of 1 zone */
        }

        const body = buildLapTickRequest({
          facts,
          allLaps,
          lapNumber,
          circuit,
          year: selectedRace?.year ?? 2024,
          drsZonesCount,
          mcSimulations: MC_SIMULATIONS_PER_LAP,
          recentMessageTypes: recentMessageTypesRef.current,
        });

        // One round trip runs the full model pipeline server-side.
        let tick: Awaited<ReturnType<typeof apiClient.lapTick>> | null = null;
        try {
          tick = await apiClient.lapTick(
            body as unknown as Record<string, unknown>
          );
        } catch (e) {
          console.error("[processLap] lap_tick failed:", e);
          useRaceStore
            .getState()
            .setStatusError(`MODEL SYNC FAILED ON LAP ${lapNumber}`);
        }

        const lstm: LstmOutput = {
          predictedLapTime: tick?.next_lap.predicted_lap_time ?? 92,
          degRate: tick?.next_lap.deg_rate ?? 0.15,
          cliffProb: tick?.next_lap.cliff_probability ?? 0.05,
        };
        const xgb: XgbOutput = {
          scProbability: tick?.safety_car.sc_probability ?? 0.05,
          topShapFactors: (tick?.safety_car.top_shap_factors ?? []).map((f) => ({
            feature: String(f.feature ?? ""),
            impact: Number(f.impact ?? 0),
          })),
        };
        const pitLaps = tick?.strategy.pit_window_laps;
        const pitWin =
          pitLaps && pitLaps.length >= 2
            ? ([pitLaps[0], pitLaps[1]] as [number, number])
            : null;
        const ppo: PpoOutput = {
          action: tick?.strategy.recommended_action ?? "STAY_OUT",
          recommendedAction: tick?.strategy.recommended_action ?? "STAY_OUT",
          confidence: tick?.strategy.action_confidence ?? 0.5,
          pitWindow: pitWin,
          finishingDistribution: tick?.strategy.finishing_distribution ?? {},
          medianFinish: tick?.strategy.median_finish ?? lap.position,
          p10Finish: tick?.strategy.p10_finish ?? Math.max(1, lap.position - 2),
          p90Finish: tick?.strategy.p90_finish ?? lap.position + 3,
        };

        setModelOutputs(lstm, xgb, ppo);

        if (facts.isActualPitLap) {
          addPitEvent({ lap: lapNumber, compound: facts.nextCompound });
        }

        const engineerResult = {
          message: tick?.engineer.message ?? "Copy that. Monitoring.",
          urgency: tick?.engineer.urgency ?? "ROUTINE",
          message_type: tick?.engineer.message_type ?? "ROUTINE_PACE_NOTE",
        };

        recentMessageTypesRef.current = [
          engineerResult.message_type,
          ...recentMessageTypesRef.current,
        ];

        addMessage({
          id: `lap-${lapNumber}-${Date.now()}`,
          message: engineerResult.message,
          urgency: normalizeUrgency(engineerResult.urgency),
          lapNumber,
          timestamp: new Date().toISOString(),
          isNew: true,
        });

        memoryRef.current.prevRainfall = facts.rainfall;
        memoryRef.current.prevPosition = lap.position;
        memoryRef.current.prevScActive = lap.safetyCarActive;
      } catch (e) {
        console.error(`[useRaceReplay] processLap(${lapNumber}) failed:`, e);
      } finally {
        setIsLoading(false);
      }
    },
    [setModelOutputs, addMessage, addPitEvent]
  );

  const nextLap = useCallback(async () => {
    if (lapLockRef.current) return;
    const store = useRaceStore.getState();
    const { allLaps, currentLap } = store;
    if (!allLaps.length) return;

    const sorted = [...allLaps].sort((a, b) => a.lapNumber - b.lapNumber);
    const idx = sorted.findIndex((l) => l.lapNumber === currentLap);
    const next =
      idx >= 0 && idx < sorted.length - 1
        ? sorted[idx + 1]!.lapNumber
        : (sorted.find((l) => l.lapNumber > currentLap)?.lapNumber ?? null);

    if (next == null) {
      setIsPlaying(false);
      return;
    }
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

  const prevLap = useCallback(async () => {
    if (lapLockRef.current) return;
    const { allLaps, currentLap } = useRaceStore.getState();
    if (!allLaps.length) return;

    const sorted = [...allLaps].sort((a, b) => a.lapNumber - b.lapNumber);
    const idx = sorted.findIndex((l) => l.lapNumber === currentLap);
    const prev =
      idx > 0
        ? sorted[idx - 1]!.lapNumber
        : sorted
            .filter((l) => l.lapNumber < currentLap)
            .reduce<number | null>((_, l) => l.lapNumber, null);

    if (prev == null) {
      setIsPlaying(false);
      return;
    }

    lapLockRef.current = true;
    try {
      setIsPlaying(false);
      setLapElapsedSeconds(0);
      setCurrentLap(prev);
      await processLap(prev);
    } finally {
      lapLockRef.current = false;
    }
  }, [setCurrentLap, processLap, setLapElapsedSeconds]);

  /** Advance to the next lap and keep playing (race-mode chain). */
  const advanceAndPlay = useCallback(async () => {
    const { allLaps, currentLap } = useRaceStore.getState();
    const hasNext = allLaps.some((l) => l.lapNumber > currentLap);
    if (!hasNext) {
      setRaceMode(false);
      return;
    }
    await nextLap();
    if (raceModeRef.current) setIsPlaying(true);
  }, [nextLap]);

  const toggleRaceMode = useCallback(() => {
    setRaceMode((on) => {
      const next = !on;
      if (next) {
        const { allLaps: laps, currentLap: L, lapElapsedSeconds: el } =
          useRaceStore.getState();
        const lap = laps.find((x) => x.lapNumber === L);
        const cap = Math.floor(lap?.lapTimeSeconds ?? 0);
        if (cap >= 25 && el < cap) {
          setIsPlaying(true);
        } else {
          // At lap end (or unplayable lap): chain straight into the next one.
          raceModeRef.current = true;
          void advanceAndPlay();
        }
      } else {
        setIsPlaying(false);
      }
      return next;
    });
  }, [advanceAndPlay]);

  const toggleAutoPlay = useCallback(() => {
    setIsPlaying((p) => {
      if (p) return false;
      const {
        allLaps: laps,
        currentLap: L,
        lapElapsedSeconds: el,
      } = useRaceStore.getState();
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
    setRaceMode(false);
    recentMessageTypesRef.current = [];
    memoryRef.current = {
      prevRainfall: undefined,
      prevPosition: null,
      prevScActive: false,
      scDurationLaps: 0,
      raceFinished: false,
    };
    useRaceStore.getState().setLapElapsedSeconds(0);
    // Backend lap numbering isn't guaranteed to start at 1 (e.g. Monaco starts at 3).
    const firstLap = Math.min(...laps.map((l) => l.lapNumber));
    useRaceStore.getState().setCurrentLap(firstLap);
    void processLap(firstLap);
  }, [raceLoadSeq, processLap]);

  // rAF playback clock: fractional time for smooth visuals, store writes
  // only on whole-second boundaries.
  useEffect(() => {
    if (!isPlaying || isLoading) {
      playbackClock.pause();
      return;
    }
    const lap = useRaceStore
      .getState()
      .allLaps.find((l) => l.lapNumber === currentLap);
    const cap = Math.floor(lap?.lapTimeSeconds ?? 0);
    if (cap < 25) {
      setIsPlaying(false);
      // Race mode skips laps without a playable duration.
      if (raceModeRef.current) void advanceAndPlay();
      return;
    }
    const el = useRaceStore.getState().lapElapsedSeconds;
    if (el >= cap) {
      setIsPlaying(false);
      if (raceModeRef.current) void advanceAndPlay();
      return;
    }
    playbackClock.configure({ cap, speed: intraLapSpeed });
    playbackClock.seek(el);
    playbackClock.onSecond = (sec) =>
      useRaceStore.getState().setLapElapsedSeconds(Math.min(sec, cap));
    playbackClock.onComplete = () => {
      setIsPlaying(false);
      if (raceModeRef.current) void advanceAndPlay();
    };
    playbackClock.play();
    return () => playbackClock.pause();
  }, [isPlaying, isLoading, intraLapSpeed, currentLap, advanceAndPlay]);

  const storeTotal = useRaceStore((s) => s.totalLaps);
  const maxLapNum =
    allLaps.length > 0 ? Math.max(...allLaps.map((l) => l.lapNumber)) : 0;
  const displayTotal = storeTotal > 0 ? storeTotal : maxLapNum || allLaps.length;

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
    raceMode,
    toggleRaceMode,
    setPlaybackSpeed: setIntraLapSpeed,
    processLap,
  };
}
