import { create } from "zustand";
import type {
  LapData,
  RadioMessage,
  SelectedRace,
  LstmOutput,
  XgbOutput,
  PpoOutput,
} from "@/types";

interface RaceStore {
  selectedRace: SelectedRace | null;
  allLaps: LapData[];
  currentLap: number;
  totalLaps: number;
  isPlaying: boolean;
  playbackSpeed: number;
  raceLoaded: boolean;
  previousPosition: number | null;
  lstmOutput: LstmOutput | null;
  xgbOutput: XgbOutput | null;
  ppoOutput: PpoOutput | null;
  messages: RadioMessage[];
  preRaceModalOpen: boolean;
  /** Incremented each LOAD RACE — replay hook bootstraps lap 1 */
  raceLoadSeq: number;
  lastReplayBootstrapSeq: number;
  /** Simulated seconds into the current lap (for map + intra-lap play). */
  lapElapsedSeconds: number;

  setSelectedRace: (race: SelectedRace | null) => void;
  setAllLaps: (laps: LapData[]) => void;
  setCurrentLap: (lap: number) => void;
  setPreRaceModalOpen: (open: boolean) => void;
  setRaceLoaded: (loaded: boolean) => void;
  setTotalLaps: (n: number) => void;
  advanceLap: () => void;
  addMessage: (msg: RadioMessage) => void;
  setModelOutputs: (
    lstm: LstmOutput | null,
    xgb: XgbOutput | null,
    ppo: PpoOutput | null
  ) => void;
  bumpRaceLoadSeq: () => void;
  clearReplayState: () => void;
  markReplayBootstrapped: (seq: number) => void;
  setLapElapsedSeconds: (sec: number) => void;
  resetRace: () => void;
  pitEvents: { lap: number; compound: string }[];
  addPitEvent: (event: { lap: number; compound: string }) => void;
}

export const useRaceStore = create<RaceStore>((set) => ({
  selectedRace: null,
  allLaps: [],
  currentLap: 0,
  totalLaps: 0,
  isPlaying: false,
  playbackSpeed: 1,
  raceLoaded: false,
  previousPosition: null,
  lstmOutput: null,
  xgbOutput: null,
  ppoOutput: null,
  messages: [],
  preRaceModalOpen: false,
  raceLoadSeq: 0,
  lastReplayBootstrapSeq: 0,
  pitEvents: [],
  lapElapsedSeconds: 0,

  setSelectedRace: (race) => set({ selectedRace: race }),
  setAllLaps: (laps) => set({ allLaps: laps }),
  setCurrentLap: (lap) => set({ currentLap: lap }),
  setPreRaceModalOpen: (open) => set({ preRaceModalOpen: open }),
  setRaceLoaded: (loaded) => set({ raceLoaded: loaded }),
  setTotalLaps: (n) => set({ totalLaps: n }),
  advanceLap: () =>
    set((s) => ({
      currentLap: s.currentLap + 1,
      previousPosition: s.allLaps[s.currentLap]?.position ?? s.previousPosition,
    })),
  addMessage: (msg) =>
    set((s) => ({
      messages: [msg, ...s.messages],
    })),
  setModelOutputs: (lstm, xgb, ppo) =>
    set({ lstmOutput: lstm, xgbOutput: xgb, ppoOutput: ppo }),
  bumpRaceLoadSeq: () => set((s) => ({ raceLoadSeq: s.raceLoadSeq + 1 })),
  clearReplayState: () =>
    set({
      messages: [],
      lstmOutput: null,
      xgbOutput: null,
      ppoOutput: null,
      currentLap: 0,
      lastReplayBootstrapSeq: 0,
      lapElapsedSeconds: 0,
    }),
  setLapElapsedSeconds: (sec) =>
    set({ lapElapsedSeconds: Math.max(0, sec) }),
  markReplayBootstrapped: (seq) => set({ lastReplayBootstrapSeq: seq }),
  resetRace: () =>
    set({
      allLaps: [],
      currentLap: 0,
      totalLaps: 0,
      isPlaying: false,
      raceLoaded: false,
      lstmOutput: null,
      xgbOutput: null,
      ppoOutput: null,
      messages: [],
      pitEvents: [],
      lapElapsedSeconds: 0,
    }),
  addPitEvent: (event) =>
    set((s) => ({ pitEvents: [...s.pitEvents, event] })),
}));
