/** Lap data — normalized from API snake_case via mapLapData */
export interface LapData {
  lapNumber: number;
  lapTimeSeconds: number;
  /** 0 SOFT … 4 WET — matches backend parquet */
  compound: number;
  compoundStr: string;
  tyreAge: number;
  position: number;
  gapAhead: number;
  gapBehind: number;
  safetyCarActive: boolean;
  pittedThisLap: boolean;
  isInlap: boolean;
  isOutlap: boolean;
  /** circuit_id from parquet (e.g. sakhir, yas_island) */
  circuitId?: string;
  /** fuel_load_kg from parquet if available, else computed */
  fuelLoad?: number;
  /** 0 = dry, 1 = wet/rain detected */
  rainfall?: number;
  /** track temperature in Celsius */
  trackTemp?: number;
  windSpeed?: number;
  trackTempDelta?: number;
  freshTyre?: number;
  stintNumber?: number;
}

/** Race list item from GET /races */
export interface RaceListItem {
  year: number;
  round: number;
  circuit: string;
  circuit_id: string;
  date?: string;
  finishing_position?: number;
  total_laps?: number;
}

/** Engineer radio message */
export interface RadioMessage {
  id: string;
  message: string;
  urgency: "ROUTINE" | "ADVISORY" | "URGENT";
  lapNumber: number;
  timestamp: string;
  isNew?: boolean;
}

/** Strategy option (compound sequence + stint lengths + rationale) */
export interface StrategyOption {
  compounds: string[];
  stintLengths: number[];
  expectedPosition: number;
  rationale: string;
}

/** Finishing position probability distribution from Monte Carlo */
export interface FinishingDistribution {
  [position: string]: number;
}

/** LSTM prediction response */
export interface LstmOutput {
  predictedLapTime: number;
  degRate: number;
  cliffProb: number;
}

/** SHAP factor from XGBoost */
export interface ShapFactor {
  feature: string;
  impact: number;
}

/** XGBoost safety car prediction response */
export interface XgbOutput {
  scProbability: number;
  topShapFactors: ShapFactor[];
}

/** PPO strategy recommendation response */
export interface PpoOutput {
  action: string;
  confidence: number;
  /** e.g. PIT_SOFT — for pit card compound hint */
  recommendedAction?: string;
  pitWindow?: [number, number] | null;
  finishingDistribution?: FinishingDistribution;
  medianFinish?: number;
  p10Finish?: number;
  p90Finish?: number;
}

/** Selected race summary for store */
export interface SelectedRace {
  year: number;
  round: number;
  circuit: string;
}
