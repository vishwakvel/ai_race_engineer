"""FastAPI application for LeclercAI — full backend."""

import os
import math
from contextlib import asynccontextmanager
from typing import Any

import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv("backend/.env")

from backend.models import ModelRegistry
from backend.utils import to_python_native

_BACKEND_ROOT = os.path.dirname(os.path.abspath(__file__))
_DEFAULT_PARQUET = os.path.join(_BACKEND_ROOT, "data", "processed", "leclerc_career_laps.parquet")

#
# Circuit ID alias resolution (parquet circuit_id -> circuit_track_maps.json key)
#
# NOTE: `cid` is normalized to lowercase and "-" -> "_" before lookup.
CIRCUIT_ID_MAP: dict[str, str] = {
    "sakhir": "sakhir",
    "jeddah": "jeddah",
    "melbourne": "melbourne",
    "imola": "imola",
    "miami": "miami",
    "monaco": "monaco",
    "monte_carlo": "monaco",
    "barcelona": "barcelona",
    "montréal": "montreal",
    "montreal": "montreal",
    "silverstone": "silverstone",
    "spielberg": "spielberg",
    "le_castellet": "le_castellet",
    "budapest": "budapest",
    "spa-francorchamps": "spa",
    "spa_francorchamps": "spa",
    "spa": "spa",
    "zandvoort": "zandvoort",
    "monza": "monza",
    "marina_bay": "marina_bay",
    "singapore": "marina_bay",
    "suzuka": "suzuka",
    "lusail": "lusail",
    "austin": "austin",
    "mexico_city": "mexico_city",
    "são_paulo": "sao_paulo",
    "sao_paulo": "sao_paulo",
    "las_vegas": "las_vegas",
    "yas_island": "yas_island",
    "yas_marina": "yas_island",
    "baku": "baku",
    "shanghai": "shanghai",
    "hockenheim": "hockenheim",
    "istanbul": "istanbul",
    "mugello": "mugello",
    "nürburgring": "nurburgring",
    "nurburgring": "nurburgring",
    "portimão": "portimao",
    "portimao": "portimao",
    "sochi": "sochi",
}


def _safe_float(val: float | None, fallback: float) -> float:
    """Replace NaN/inf/non-numeric with a fallback value for JSON safety."""
    try:
        f = float(val)  # type: ignore[arg-type]
        if math.isnan(f) or math.isinf(f):
            return fallback
        return f
    except (TypeError, ValueError):
        return fallback

CIRCUIT_NAMES = {
    "sakhir": "Bahrain Grand Prix",
    "bahrain": "Bahrain Grand Prix",
    "jeddah": "Saudi Arabian Grand Prix",
    "melbourne": "Australian Grand Prix",
    "albert_park": "Australian Grand Prix",
    "imola": "Emilia Romagna Grand Prix",
    "miami": "Miami Grand Prix",
    "monaco": "Monaco Grand Prix",
    "monte_carlo": "Monaco Grand Prix",
    "barcelona": "Spanish Grand Prix",
    "catalunya": "Spanish Grand Prix",
    "baku": "Azerbaijan Grand Prix",
    "montréal": "Canadian Grand Prix",
    "montreal": "Canadian Grand Prix",
    "silverstone": "British Grand Prix",
    "spielberg": "Austrian Grand Prix",
    "red_bull_ring": "Austrian Grand Prix",
    "le_castellet": "French Grand Prix",
    "paul_ricard": "French Grand Prix",
    "budapest": "Hungarian Grand Prix",
    "hungaroring": "Hungarian Grand Prix",
    "spa": "Belgian Grand Prix",
    "spa-francorchamps": "Belgian Grand Prix",
    "zandvoort": "Dutch Grand Prix",
    "monza": "Italian Grand Prix",
    "marina_bay": "Singapore Grand Prix",
    "singapore": "Singapore Grand Prix",
    "suzuka": "Japanese Grand Prix",
    "lusail": "Qatar Grand Prix",
    "austin": "United States Grand Prix",
    "americas": "United States Grand Prix",
    "mexico_city": "Mexico City Grand Prix",
    "rodriguez": "Mexico City Grand Prix",
    "são_paulo": "São Paulo Grand Prix",
    "interlagos": "São Paulo Grand Prix",
    "las_vegas": "Las Vegas Grand Prix",
    "vegas": "Las Vegas Grand Prix",
    "yas_island": "Abu Dhabi Grand Prix",
    "yas_marina": "Abu Dhabi Grand Prix",
    "portimão": "Portuguese Grand Prix",
    "portimao": "Portuguese Grand Prix",
    "mugello": "Tuscan Grand Prix",
    "nürburgring": "Eifel Grand Prix",
    "nurburgring": "Eifel Grand Prix",
    "istanbul": "Turkish Grand Prix",
    "sochi": "Russian Grand Prix",
    "shanghai": "Chinese Grand Prix",
    "hockenheim": "German Grand Prix",
    "hockenheimring": "German Grand Prix",
    "bahrain_outer": "Bahrain Outer",
}


class LapItem(BaseModel):
    lap_number: int
    lap_time_seconds: float
    compound: int
    compound_str: str
    tyre_age: int
    position: int
    gap_ahead_seconds: float
    gap_behind_seconds: float
    safety_car_active: int
    pitted_this_lap: int
    is_inlap: int
    is_outlap: int
    circuit_id: str = ""
    fuel_load_kg: float | None = None
    rainfall: int = 0
    track_temp_celsius: float | None = None
    wind_speed: float | None = None
    track_temp_delta: float | None = None
    fresh_tyre: int | None = None
    stint_number: int | None = None


class NextLapRequest(BaseModel):
    stint_laps: list[Any] = Field(default_factory=list)
    current_state: dict[str, Any] = Field(default_factory=dict)


class NextLapResponse(BaseModel):
    predicted_lap_time: float
    deg_rate: float
    cliff_probability: float
    warning: str | None = None


class SafetyCarRequest(BaseModel):
    lap_number: int
    laps_remaining: int
    circuit: str = "bahrain"
    track_temp_celsius: float = 35.0
    air_temp_celsius: float = 25.0
    rainfall: int = 0
    incidents_so_far: int = 0
    cars_within_2s: float = 2.0
    mean_tyre_age_field: float = 15.0
    year: int = 2024
    wind_speed: float = 0.0
    track_temp_delta: float = 0.0
    tyre_age: int = 15
    compound: int = 1


class SafetyCarResponse(BaseModel):
    sc_probability: float
    top_shap_factors: list[dict[str, Any]]
    vsc_ratio: float = 0.35


class StrategyRecommendRequest(BaseModel):
    state: dict[str, Any] = Field(default_factory=dict)
    current_state: dict[str, Any] = Field(default_factory=dict)
    run_monte_carlo: bool = False
    n_simulations: int = 500


class StrategyRecommendResponse(BaseModel):
    recommended_action: str
    action_confidence: float
    pit_window_laps: list[int] | None = None
    finishing_distribution: dict[str, float] = {}
    median_finish: int = 0
    p10_finish: int = 0
    p90_finish: int = 0
    historical_compound: int | None = None
    recommended_compound: str | None = None


class EngineerMessageRequest(BaseModel):
    context: dict[str, Any] = Field(default_factory=dict)
    recent_message_types: list[str] = Field(default_factory=list)


class EngineerMessageResponse(BaseModel):
    message: str
    urgency: str
    message_type: str
    lap_number: int
    fallback: bool = False


class StrategyOption(BaseModel):
    compounds: list[str]
    stint_lengths: list[int]
    expected_position: int
    rationale: str


class PreraceStrategyResponse(BaseModel):
    opening_message: str
    recommended: StrategyOption
    alternative_1: StrategyOption
    alternative_2: StrategyOption


@asynccontextmanager
async def lifespan(app: FastAPI):
    registry = ModelRegistry()
    registry.load_all()
    app.state.models = registry

    data_dir = os.environ.get("DATA_DIR", "").strip()
    if data_dir:
        parquet_path = os.path.join(data_dir, "leclerc_career_laps.parquet")
        if not os.path.isabs(parquet_path):
            parquet_path = os.path.normpath(os.path.join(os.getcwd(), parquet_path))
    else:
        parquet_path = _DEFAULT_PARQUET

    if not os.path.exists(parquet_path):
        alt = _DEFAULT_PARQUET
        if os.path.exists(alt):
            parquet_path = alt
            print(f"[main] Using parquet at {parquet_path}")

    if os.path.exists(parquet_path):
        app.state.df = pd.read_parquet(parquet_path)
        print(f"[main] Loaded {len(app.state.df)} laps from {parquet_path}")
    else:
        print(f"[main] WARNING: parquet not found at {parquet_path}")
        app.state.df = pd.DataFrame()

    yield


app = FastAPI(title="LeclercAI", description="AI race engineer API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://ai-race-engineer-six.vercel.app",
        "https://*.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health(request: Request):
    models = request.app.state.models
    df = getattr(request.app.state, "df", None)
    return {
        "status": "ok",
        "models_loaded": models.ready if models else False,
        "lstm_loaded": models.lstm.loaded if models and models.lstm else False,
        "xgb_loaded": models.xgb.loaded if models and models.xgb else False,
        "ppo_loaded": models.ppo.loaded if models and models.ppo else False,
        "data_rows": len(df) if df is not None else 0,
    }


@app.get("/races")
async def get_races(request: Request):
    df = getattr(request.app.state, "df", None)
    if df is None or df.empty:
        return []

    races = (
        df.groupby(["year", "round", "circuit_id"])
        .agg(
            finishing_position=("position", "last"),
            total_laps=("lap_number", "max"),
        )
        .reset_index()
        .sort_values(["year", "round"])
    )

    result = []
    for _, row in races.iterrows():
        cid = str(row["circuit_id"]).lower()
        name = CIRCUIT_NAMES.get(cid, cid.replace("_", " ").title())
        result.append(
            {
                "year": int(row["year"]),
                "round": int(row["round"]),
                "circuit_id": cid,
                "circuit_name": name,
                "circuit": name,
                "finishing_position": int(row["finishing_position"])
                if pd.notna(row["finishing_position"])
                else None,
                "total_laps": int(row["total_laps"]),
            }
        )
    return result


@app.get("/circuit/track_map/{circuit_id:path}")
async def get_track_map(circuit_id: str, request: Request) -> dict:
    """Return track map coordinates for a circuit. circuit_id matches parquet (e.g. sakhir, yas_island)."""
    models = request.app.state.models
    maps = getattr(models, "circuit_track_maps", {})
    cid = str(circuit_id or "").lower().strip().replace("-", "_")
    map_key = CIRCUIT_ID_MAP.get(cid, cid)
    data = maps.get(map_key)
    if not data:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No map for '{cid}' (resolved to '{map_key}'). "
                f"Available keys: {sorted(maps.keys())}"
            ),
        )
    return {**data, "circuit_id": map_key}


@app.get("/race/{year:int}/{round:int}/laps", response_model=list[LapItem])
def get_race_laps(year: int, round: int, request: Request) -> list[LapItem]:
    df = getattr(request.app.state, "df", None)
    if df is None or df.empty:
        return []
    sub = df[(df["year"] == year) & (df["round"] == round)]
    if sub.empty:
        return []
    out = []
    cid = str(sub.iloc[0]["circuit_id"]).lower() if not sub.empty else ""
    for _, row in sub.iterrows():
        out.append(
            LapItem(
                lap_number=int(row["lap_number"]),
                lap_time_seconds=float(row.get("lap_time_seconds", 0)),
                compound=int(row.get("compound", 1)),
                compound_str=str(row.get("compound_str", "MEDIUM")),
                tyre_age=int(row.get("tyre_age", 0)),
                position=int(row.get("position", 10)),
                gap_ahead_seconds=float(row.get("gap_ahead_seconds", 0)),
                gap_behind_seconds=float(row.get("gap_behind_seconds", 0)),
                safety_car_active=int(row.get("safety_car_active", 0)),
                pitted_this_lap=int(row.get("pitted_this_lap", row.get("is_inlap", 0))),
                is_inlap=int(row.get("is_inlap", 0)),
                is_outlap=int(row.get("is_outlap", 0)),
                circuit_id=cid,
                fuel_load_kg=float(row["fuel_load_kg"]) if "fuel_load_kg" in row and pd.notna(row.get("fuel_load_kg")) else None,
                rainfall=int(row.get("rainfall", 0)) if pd.notna(row.get("rainfall")) else 0,
                track_temp_celsius=float(row["track_temp_celsius"]) if "track_temp_celsius" in row and pd.notna(row.get("track_temp_celsius")) else None,
                wind_speed=float(row["wind_speed"]) if "wind_speed" in row and pd.notna(row.get("wind_speed")) else None,
                track_temp_delta=float(row["track_temp_delta"]) if "track_temp_delta" in row and pd.notna(row.get("track_temp_delta")) else None,
                fresh_tyre=int(row["fresh_tyre"]) if "fresh_tyre" in row and pd.notna(row.get("fresh_tyre")) else None,
                stint_number=int(row["stint_number"]) if "stint_number" in row and pd.notna(row.get("stint_number")) else None,
            )
        )
    return out


@app.post("/predict/next_lap")
async def predict_next_lap(body: NextLapRequest, request: Request):
    models = request.app.state.models
    stint_laps = list(body.stint_laps or [])
    current_state = dict(body.current_state or {})
    cid = str(current_state.get("circuit_id", "") or "").lower().strip()
    row = getattr(models, "circuit_lap_by_id", {}).get(cid)
    if row:
        current_state.setdefault("circuit_lt_mean", float(row["circuit_lt_mean"]))
        current_state.setdefault("circuit_lt_std", float(row["circuit_lt_std"]))
    else:
        current_state.setdefault("circuit_lt_mean", 92.0)
        current_state.setdefault("circuit_lt_std", 8.0)
    ln = float(current_state.get("lap_number", 1))
    lr = float(current_state.get("laps_remaining", 30))
    current_state.setdefault("total_laps", int(ln + lr))
    result = models.lstm.predict(stint_laps, current_state)
    weather_result = models.weather.predict(current_state) if getattr(models, "weather", None) else {}
    weather_delta = float(weather_result.get("weather_lap_delta", 0.0) or 0.0)
    pred_lt = _safe_float(result.get("predicted_lap_time"), 92.0) + weather_delta
    return {
        "predicted_lap_time": pred_lt,
        "deg_rate": _safe_float(result.get("deg_rate"), 0.15),
        "cliff_probability": _safe_float(result.get("cliff_probability"), 0.05),
        "weather_condition": weather_result.get("weather_condition", "dry"),
        "weather_advisory": weather_result.get("weather_advisory"),
        "rain_risk_trend": weather_result.get("rain_risk_trend", "stable"),
        "warning": None if models.lstm.loaded else "Model not loaded — using fallback",
    }


@app.post("/predict/safety_car", response_model=SafetyCarResponse)
async def predict_safety_car(body: SafetyCarRequest, request: Request):
    models = request.app.state.models
    state = {
        "lap_number": body.lap_number,
        "laps_remaining": body.laps_remaining,
        "circuit_id": body.circuit,
        "track_temp_celsius": body.track_temp_celsius,
        "air_temp_celsius": body.air_temp_celsius,
        "rainfall": float(body.rainfall),
        "incidents_so_far": body.incidents_so_far,
        "cars_within_2s": body.cars_within_2s,
        "mean_tyre_age_field": body.mean_tyre_age_field,
        "year": body.year,
        "wind_speed": body.wind_speed,
        "track_temp_delta": body.track_temp_delta,
        "tyre_age": body.tyre_age,
        "compound": body.compound,
    }
    result = models.xgb.predict(state)
    weather_result = models.weather.predict(state) if getattr(models, "weather", None) else {}
    sc_mult = float(weather_result.get("weather_sc_multiplier", 1.0) or 1.0)
    adj = min(0.95, float(result.get("sc_probability", 0.05)) * sc_mult)
    return SafetyCarResponse(
        sc_probability=_safe_float(adj, 0.05),
        top_shap_factors=to_python_native(result.get("top_shap_factors", [])),
        vsc_ratio=_safe_float(result.get("vsc_ratio", 0.35), 0.35),
    )


@app.get("/predict/weather/{circuit_id:path}")
async def predict_weather(
    request: Request,
    circuit_id: str,
    track_temp: float = 35.0,
    air_temp: float = 25.0,
    rainfall: int = 0,
    wind_speed: float = 0.0,
    track_temp_delta: float = 0.0,
    lap_number: int = 1,
    total_laps: int = 57,
):
    models = request.app.state.models
    st = {
        "circuit_id": circuit_id,
        "track_temp_celsius": track_temp,
        "air_temp_celsius": air_temp,
        "rainfall": rainfall,
        "wind_speed": wind_speed,
        "track_temp_delta": track_temp_delta,
        "lap_number": lap_number,
        "total_laps": total_laps,
        "laps_remaining": max(0, total_laps - lap_number),
    }
    w = getattr(models, "weather", None)
    if w is None:
        from backend.models.weather_model import WeatherModel

        w = WeatherModel("")
    return to_python_native(w.predict(st))


@app.get("/debug/model_versions")
async def debug_model_versions(request: Request):
    import json as _json

    path = os.path.join(
        os.environ.get("MODEL_DIR", os.path.join(_BACKEND_ROOT, "data", "models")),
        "model_versions.json",
    )
    if not os.path.exists(path):
        return {"error": "model_versions.json not found"}
    with open(path) as f:
        return _json.load(f)


@app.post("/strategy/recommend", response_model=StrategyRecommendResponse)
def strategy_recommend(
    body: StrategyRecommendRequest, request: Request
) -> StrategyRecommendResponse:
    registry = request.app.state.models
    state = dict(body.current_state or body.state or {})
    _cid = str(state.get("circuit_id", "") or "").lower().strip()
    _crow = getattr(registry, "circuit_lap_by_id", {}).get(_cid)
    if _crow:
        state["circuit_lt_mean"] = float(_crow["circuit_lt_mean"])
        state["circuit_lt_std"] = float(_crow["circuit_lt_std"])
    state.setdefault("year", 2024)
    state.setdefault(
        "total_laps",
        int(state.get("lap_number", 1)) + int(state.get("laps_remaining", 30)),
    )
    state.setdefault("drs_zones_count", 2)
    hist_c = state.get("next_compound")
    if hist_c is not None and not isinstance(hist_c, int):
        try:
            hist_c = int(hist_c)
        except (TypeError, ValueError):
            hist_c = None

    if not registry.feature_builder:
        return StrategyRecommendResponse(
            recommended_action="STAY_OUT",
            action_confidence=0.7,
            pit_window_laps=None,
            finishing_distribution={},
            median_finish=state.get("position", 10),
            p10_finish=state.get("position", 10),
            p90_finish=state.get("position", 10),
            historical_compound=hist_c,
            recommended_compound=None,
        )
    obs = registry.feature_builder.build_rl_observation(state)
    ppo_result = registry.ppo.predict(obs)
    recommended_action = ppo_result["action_name"]
    action_confidence = float(ppo_result["confidence"])

    pit_window_laps = None
    try:
        pit_laps = []
        for lap_delta in range(1, 9):
            s = dict(state)
            s["lap_number"] = s.get("lap_number", 1) + lap_delta
            s["laps_remaining"] = max(0, s.get("laps_remaining", 50) - lap_delta)
            o = registry.feature_builder.build_rl_observation(s)
            pred = registry.ppo.predict(o)
            if pred["action"] > 0:
                pit_laps.append(s["lap_number"])
        if pit_laps:
            pit_window_laps = [min(pit_laps), max(pit_laps)]
    except Exception:
        pass

    finishing_distribution = {}
    median_finish = state.get("position", 10)
    p10_finish = median_finish
    p90_finish = median_finish
    if body.run_monte_carlo and registry.monte_carlo and body.n_simulations:
        mc = registry.monte_carlo.run(
            state, strategy=None, n_simulations=min(body.n_simulations, 500)
        )
        finishing_distribution = to_python_native(mc.get("finishing_distribution", {}))
        try:
            median_finish = int(_safe_float(mc.get("median_finish", median_finish), float(median_finish)))
        except (TypeError, ValueError):
            median_finish = median_finish
        try:
            p10_finish = int(_safe_float(mc.get("p10_finish", p10_finish), float(p10_finish)))
        except (TypeError, ValueError):
            p10_finish = p10_finish
        try:
            p90_finish = int(_safe_float(mc.get("p90_finish", p90_finish), float(p90_finish)))
        except (TypeError, ValueError):
            p90_finish = p90_finish

    rec_comp = None
    if "PIT_" in recommended_action:
        rec_comp = recommended_action.replace("PIT_", "").upper()

    return StrategyRecommendResponse(
        recommended_action=recommended_action,
        action_confidence=_safe_float(action_confidence, 0.7),
        pit_window_laps=pit_window_laps,
        finishing_distribution=finishing_distribution,
        median_finish=median_finish,
        p10_finish=p10_finish,
        p90_finish=p90_finish,
        historical_compound=hist_c if hist_c is not None else None,
        recommended_compound=rec_comp,
    )


@app.post("/engineer/message")
async def engineer_message(body: EngineerMessageRequest, request: Request):
    models = request.app.state.models
    ctx = dict(body.context or {})
    recent_types = list(body.recent_message_types or [])
    try:
        if ctx.get("is_race_end"):
            result = models.radio.generate_message_with_type(ctx, recent_types, "RACE_END")
        else:
            result = models.radio.generate_message(ctx, recent_types=recent_types)
        return {
            "message": result.get("message", "Copy that. Monitoring."),
            "urgency": result.get("urgency", "ROUTINE"),
            "message_type": result.get("message_type", "ROUTINE_PACE_NOTE"),
            "lap_number": ctx.get("lap_number", 0),
            "fallback": False,
        }
    except Exception as e:
        print(f"[engineer/message] Error: {e}")
        return {
            "message": "Copy that. Monitoring.",
            "urgency": "ROUTINE",
            "message_type": "ROUTINE_PACE_NOTE",
            "lap_number": ctx.get("lap_number", 0),
            "fallback": True,
        }


@app.get("/engineer/prerace_strategy", response_model=PreraceStrategyResponse)
def get_prerace_strategy(
    request: Request,
    circuit: str = "",
    year: int = 2024,
    total_laps: int = 50,
    tyre_allocation: str = "0,1,2",
) -> PreraceStrategyResponse:
    registry = request.app.state.models
    try:
        compounds = [int(x.strip()) for x in tyre_allocation.split(",") if x.strip()]
    except Exception:
        compounds = [0, 1, 2]
    context = {
        "circuit_name": circuit or "Unknown",
        "total_laps": total_laps,
        "available_compounds": compounds,
        "circuit_sc_rate": 0.2,
        "recommended_strategy_description": "Two-stop: Medium then Hard.",
        "expected_finish_recommended": 3,
    }
    if (
        registry.monte_carlo
        and getattr(request.app.state, "df", None) is not None
        and not request.app.state.df.empty
    ):
        initial = {
            "lap_number": 1,
            "laps_remaining": total_laps - 1,
            "position": 5,
            "compound": 1,
            "tyre_age": 0,
            "fuel_load_kg": 110.0,
            "gap_ahead_seconds": 2.0,
            "gap_behind_seconds": 1.5,
            "sc_probability": 0.05,
            "cliff_probability": 0.0,
            "soft_available": 1,
            "medium_available": 1,
            "hard_available": 1,
            "total_laps": total_laps,
            "track_temp_celsius": 35,
            "air_temp_celsius": 25,
        }
        strategies = [
            {"pit_laps": [25, 50], "compounds": [1, 2]},
            {"pit_laps": [18, 36, 54], "compounds": [0, 1, 2]},
            {"pit_laps": [30], "compounds": [2]},
        ]
        compared = registry.monte_carlo.compare_strategies(
            initial, strategies, n_simulations=100
        )
        if compared:
            best = compared[0]
            context["recommended_strategy_description"] = str(best.get("compounds", []))
            context["expected_finish_recommended"] = int(best.get("expected_finish", 3))
    brief = registry.radio.generate_prerace_brief(context)

    def to_opt(d):
        return StrategyOption(
            compounds=d.get("compounds", []),
            stint_lengths=d.get("stint_lengths", []),
            expected_position=int(d.get("expected_position", 3)),
            rationale=str(d.get("rationale", "")),
        )

    return PreraceStrategyResponse(
        opening_message=brief.get("opening_message", ""),
        recommended=to_opt(brief.get("recommended", {})),
        alternative_1=to_opt(brief.get("alternative_1", {})),
        alternative_2=to_opt(brief.get("alternative_2", {})),
    )
