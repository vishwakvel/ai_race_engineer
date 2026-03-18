import axios from "axios";
import type {
  RaceListItem,
  LapData,
  StrategyOption,
  FinishingDistribution,
} from "@/types";

const baseURL =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL
    ? import.meta.env.VITE_API_BASE_URL
    : "http://localhost:8000";

const client = axios.create({
  baseURL,
  timeout: 15000, // 15 seconds — Claude API can be slow
});

const COMPOUND_BY_INT = [
  "SOFT",
  "MEDIUM",
  "HARD",
  "INTERMEDIATE",
  "WET",
] as const;

function parseCompound(raw: Record<string, unknown>): {
  compound: number;
  compoundStr: string;
} {
  const n = raw.compound;
  if (typeof n === "number" && Number.isFinite(n)) {
    const c = Math.min(4, Math.max(0, Math.round(n)));
    return { compound: c, compoundStr: COMPOUND_BY_INT[c] ?? "MEDIUM" };
  }
  const s = String(raw.compound_str ?? raw.compoundStr ?? "MEDIUM").toUpperCase();
  if (s.includes("WET")) return { compound: 4, compoundStr: "WET" };
  if (s.includes("INTER")) return { compound: 3, compoundStr: "INTERMEDIATE" };
  if (s.includes("HARD")) return { compound: 2, compoundStr: "HARD" };
  if (s.includes("MEDIUM")) return { compound: 1, compoundStr: "MEDIUM" };
  if (
    s.includes("SOFT") ||
    s.includes("HYPER") ||
    s.includes("ULTRA") ||
    s.includes("SUPER")
  )
    return { compound: 0, compoundStr: "SOFT" };
  return { compound: 1, compoundStr: "MEDIUM" };
}

function truthy(v: unknown): boolean {
  return v === 1 || v === true;
}

/**
 * Maps backend snake_case (or already-camelCase) lap rows to LapData.
 */
export function mapLapData(raw: unknown): LapData | null {
  if (raw == null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const lapNumber = Number(r.lap_number ?? r.lapNumber);
  if (!Number.isFinite(lapNumber)) return null;

  const { compound, compoundStr } = parseCompound(r);

  return {
    lapNumber,
    lapTimeSeconds: Number(r.lap_time_seconds ?? r.lapTimeSeconds ?? 0),
    compound,
    compoundStr,
    tyreAge: Number(r.tyre_age ?? r.tyreAge ?? 0),
    position: Number(r.position ?? 0),
    gapAhead: Number(r.gap_ahead_seconds ?? r.gapAhead ?? 0),
    gapBehind: Number(r.gap_behind_seconds ?? r.gapBehind ?? 0),
    safetyCarActive:
      truthy(r.safety_car_active) || r.safetyCarActive === true,
    pittedThisLap: truthy(r.pitted_this_lap) || r.pittedThisLap === true,
    isInlap: truthy(r.is_inlap) || r.isInlap === true,
    isOutlap: truthy(r.is_outlap) || r.isOutlap === true,
    circuitId: typeof r.circuit_id === "string" ? r.circuit_id : undefined,
    fuelLoad:
      typeof r.fuel_load_kg === "number" && Number.isFinite(r.fuel_load_kg)
        ? r.fuel_load_kg
        : typeof r.fuelLoad === "number" && Number.isFinite(r.fuelLoad)
          ? r.fuelLoad
          : undefined,
    rainfall: Number(r.rainfall ?? 0) === 1 ? 1 : 0,
    trackTemp:
      typeof r.track_temp_celsius === "number" && Number.isFinite(r.track_temp_celsius)
        ? r.track_temp_celsius
        : typeof r.trackTemp === "number" && Number.isFinite(r.trackTemp)
          ? r.trackTemp
          : undefined,
    windSpeed:
      typeof r.wind_speed === "number" && Number.isFinite(r.wind_speed)
        ? r.wind_speed
        : undefined,
    trackTempDelta:
      typeof r.track_temp_delta === "number" && Number.isFinite(r.track_temp_delta)
        ? r.track_temp_delta
        : undefined,
    freshTyre:
      typeof r.fresh_tyre === "number" && Number.isFinite(r.fresh_tyre)
        ? r.fresh_tyre
        : undefined,
    stintNumber:
      typeof r.stint_number === "number" && Number.isFinite(r.stint_number)
        ? r.stint_number
        : undefined,
  };
}

/** GET /races — list of all Leclerc races */
export function getRaces(): Promise<RaceListItem[]> {
  return client.get("/races").then((res) => res.data);
}

export interface TrackMapData {
  points: [number, number][];
  viewBox: string;
  circuit_id: string;
  drs_zones_count?: number;
}

/** GET /circuit/track_map/:circuitId — track map coordinates */
export function getTrackMap(circuitId: string): Promise<TrackMapData> {
  return client
    .get<TrackMapData>(`/circuit/track_map/${encodeURIComponent(circuitId)}`)
    .then((res) => res.data);
}

/** GET /race/{year}/{round}/laps — lap data for a race */
export async function getRaceLaps(
  year: number,
  round: number
): Promise<LapData[]> {
  const res = await client.get<unknown[]>(`/race/${year}/${round}/laps`);
  const rows = res.data;
  if (!Array.isArray(rows)) return [];
  const out: LapData[] = [];
  for (const row of rows) {
    const m = mapLapData(row);
    if (m) out.push(m);
  }
  return out;
}

export interface NextLapApiResponse {
  predicted_lap_time: number;
  deg_rate: number;
  cliff_probability: number;
  weather_condition?: string;
  weather_advisory?: string | null;
  rain_risk_trend?: string;
  warning?: string | null;
}

/** POST /predict/next_lap — LSTM */
export async function predictNextLap(body: {
  stint_laps: Record<string, unknown>[];
  current_state: Record<string, unknown>;
}): Promise<NextLapApiResponse> {
  const res = await client.post<NextLapApiResponse>("/predict/next_lap", body);
  return res.data;
}

export interface SafetyCarApiResponse {
  sc_probability: number;
  top_shap_factors: { feature: string; impact?: number }[];
  vsc_ratio?: number;
}

/** POST /predict/safety_car — XGBoost */
export async function predictSafetyCar(body: {
  lap_number: number;
  laps_remaining: number;
  circuit: string;
  track_temp_celsius: number;
  air_temp_celsius: number;
  rainfall: number;
  incidents_so_far: number;
  cars_within_2s: number;
  mean_tyre_age_field: number;
  year: number;
  wind_speed?: number;
  track_temp_delta?: number;
  tyre_age?: number;
  compound?: number;
}): Promise<SafetyCarApiResponse> {
  const res = await client.post<SafetyCarApiResponse>("/predict/safety_car", body);
  return res.data;
}

export interface StrategyRecommendApiResponse {
  recommended_action: string;
  action_confidence: number;
  pit_window_laps: number[] | null;
  finishing_distribution: FinishingDistribution;
  median_finish: number;
  p10_finish: number;
  p90_finish: number;
}

/** POST /strategy/recommend — PPO */
export async function recommendStrategy(body: {
  state?: Record<string, unknown>;
  current_state?: Record<string, unknown>;
  run_monte_carlo?: boolean;
  n_simulations?: number;
}): Promise<StrategyRecommendApiResponse> {
  const res = await client.post<StrategyRecommendApiResponse>(
    "/strategy/recommend",
    body
  );
  return res.data;
}

/** POST /engineer/message — LLM radio */
export async function getEngineerMessage(body: {
  context: Record<string, unknown>;
  recent_message_types?: string[];
}): Promise<{
  message: string;
  urgency: string;
  message_type?: string;
  lap_number?: number;
  fallback?: boolean;
}> {
  const res = await client.post("/engineer/message", body);
  return res.data;
}

/** GET /engineer/prerace_strategy */
export function getPreraceStrategy(params: {
  circuit: string;
  year: number;
  tyre_allocation: string;
}): Promise<{
  recommended: StrategyOption;
  alternative_1: StrategyOption;
  alternative_2: StrategyOption;
  opening_message: string;
}> {
  return client
    .get("/engineer/prerace_strategy", { params })
    .then((res) => res.data);
}

export const apiClient = {
  getRaces,
  getRaceLaps,
  getTrackMap,
  predictNextLap,
  predictSafetyCar,
  recommendStrategy,
  getEngineerMessage,
  getPreraceStrategy,
};
