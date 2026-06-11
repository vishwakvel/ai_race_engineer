"""FastAPI application for LeclercAI — full backend."""

import logging
import os
import math
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from typing import Any

import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
load_dotenv("backend/.env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger("leclerc_ai")

from backend.models import ModelRegistry
from backend.routes.data import build_races_index, router as data_router
from backend.schemas import (
    EngineerMessageRequest,
    LapTickRequest,
    LapTickResponse,
    NextLapRequest,
    PreraceStrategyResponse,
    SafetyCarRequest,
    SafetyCarResponse,
    StrategyOption,
    StrategyRecommendRequest,
    StrategyRecommendResponse,
)
from backend.utils import to_python_native

_BACKEND_ROOT = os.path.dirname(os.path.abspath(__file__))
_DEFAULT_PARQUET = os.path.join(_BACKEND_ROOT, "data", "processed", "leclerc_career_laps.parquet")


def _safe_float(val: float | None, fallback: float) -> float:
    """Replace NaN/inf/non-numeric with a fallback value for JSON safety."""
    try:
        f = float(val)  # type: ignore[arg-type]
        if math.isnan(f) or math.isinf(f):
            return fallback
        return f
    except (TypeError, ValueError):
        return fallback


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
            logger.info("Using parquet at %s", parquet_path)

    if os.path.exists(parquet_path):
        app.state.df = pd.read_parquet(parquet_path)
        logger.info("Loaded %d laps from %s", len(app.state.df), parquet_path)
    else:
        logger.warning("Parquet not found at %s", parquet_path)
        app.state.df = pd.DataFrame()

    # Race index is static per process — build once instead of per request.
    app.state.races_index = build_races_index(app.state.df)

    yield


app = FastAPI(title="LeclercAI", description="AI race engineer API", lifespan=lifespan)
app.include_router(data_router)

# NOTE: "https://*.vercel.app" in allow_origins never matched — wildcards are
# only supported via allow_origin_regex.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:3000",
        "https://ai-race-engineer-six.vercel.app",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

#
# Per-IP sliding-window rate limit. Deliberately dependency-free — single
# worker, in-memory state is fine for this deployment shape.
#
RATE_LIMIT_PER_MINUTE = int(os.environ.get("RATE_LIMIT_PER_MINUTE", "240"))
_RATE_WINDOW_SECONDS = 60.0
_rate_buckets: dict[str, deque] = defaultdict(deque)


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    if RATE_LIMIT_PER_MINUTE <= 0 or request.url.path == "/health":
        return await call_next(request)
    client_ip = request.client.host if request.client else "unknown"
    now = time.monotonic()
    bucket = _rate_buckets[client_ip]
    while bucket and now - bucket[0] > _RATE_WINDOW_SECONDS:
        bucket.popleft()
    if len(bucket) >= RATE_LIMIT_PER_MINUTE:
        return JSONResponse(
            status_code=429,
            content={"detail": "Rate limit exceeded. Slow down."},
            headers={"Retry-After": "10"},
        )
    bucket.append(now)
    return await call_next(request)


def _predict_next_lap_impl(models, stint_laps: list, current_state: dict) -> dict:
    current_state = dict(current_state or {})
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
    result = models.lstm.predict(list(stint_laps or []), current_state)
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


def _predict_safety_car_impl(models, body: SafetyCarRequest) -> SafetyCarResponse:
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


@app.post("/predict/next_lap")
def predict_next_lap(body: NextLapRequest, request: Request):
    return _predict_next_lap_impl(
        request.app.state.models, body.stint_laps, body.current_state
    )


@app.post("/predict/safety_car", response_model=SafetyCarResponse)
def predict_safety_car(body: SafetyCarRequest, request: Request):
    return _predict_safety_car_impl(request.app.state.models, body)


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
    # Gated: only available when explicitly enabled (never in production).
    if os.environ.get("DEBUG_ENDPOINTS", "").lower() not in ("1", "true", "yes"):
        raise HTTPException(status_code=404, detail="Not found")
    import json as _json

    path = os.path.join(
        os.environ.get("MODEL_DIR", os.path.join(_BACKEND_ROOT, "data", "models")),
        "model_versions.json",
    )
    if not os.path.exists(path):
        return {"error": "model_versions.json not found"}
    with open(path) as f:
        return _json.load(f)


def _strategy_recommend_impl(
    registry, state: dict, run_monte_carlo: bool, n_simulations: int
) -> StrategyRecommendResponse:
    state = dict(state or {})
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
    if run_monte_carlo and registry.monte_carlo and n_simulations:
        mc = registry.monte_carlo.run(
            state, strategy=None, n_simulations=min(n_simulations, 500)
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


@app.post("/strategy/recommend", response_model=StrategyRecommendResponse)
def strategy_recommend(
    body: StrategyRecommendRequest, request: Request
) -> StrategyRecommendResponse:
    return _strategy_recommend_impl(
        request.app.state.models,
        body.current_state or body.state or {},
        body.run_monte_carlo,
        body.n_simulations,
    )


def _engineer_message_impl(models, ctx: dict, recent_types: list[str]) -> dict:
    ctx = dict(ctx or {})
    recent_types = list(recent_types or [])
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
    except Exception:
        logger.exception("engineer/message failed — returning fallback")
        return {
            "message": "Copy that. Monitoring.",
            "urgency": "ROUTINE",
            "message_type": "ROUTINE_PACE_NOTE",
            "lap_number": ctx.get("lap_number", 0),
            "fallback": True,
        }


@app.post("/engineer/message")
def engineer_message(body: EngineerMessageRequest, request: Request):
    return _engineer_message_impl(
        request.app.state.models, body.context, body.recent_message_types
    )


@app.post("/race/lap_tick", response_model=LapTickResponse)
def race_lap_tick(body: LapTickRequest, request: Request) -> LapTickResponse:
    """Run the full per-lap model pipeline server-side in one round trip.

    Replaces the client-orchestrated waterfall (next_lap → safety_car →
    strategy → engineer message) with a single request. Model-derived fields
    of the engineer context are injected here; the client supplies only
    race-replay state (positions, SC flags, pit events, weather telemetry).
    """
    models = request.app.state.models

    lap_pred = _predict_next_lap_impl(
        models, body.next_lap.stint_laps, body.next_lap.current_state
    )
    sc = _predict_safety_car_impl(models, body.safety_car)

    # Strategy state depends on phase-1 outputs.
    strategy_state = dict(body.strategy.current_state or body.strategy.state or {})
    strategy_state.setdefault("sc_probability", sc.sc_probability)
    strategy_state.setdefault("cliff_probability", lap_pred["cliff_probability"])
    strategy = _strategy_recommend_impl(
        models,
        strategy_state,
        body.strategy.run_monte_carlo,
        body.strategy.n_simulations,
    )

    ctx = dict(body.engineer_context or {})
    ctx.update(
        {
            "predicted_lap_time": lap_pred["predicted_lap_time"],
            "deg_rate": lap_pred["deg_rate"],
            "cliff_probability": lap_pred["cliff_probability"],
            "weather_condition": lap_pred["weather_condition"],
            "weather_advisory": lap_pred["weather_advisory"],
            "rain_risk_trend": lap_pred["rain_risk_trend"],
            "sc_probability": sc.sc_probability,
            "sc_shap_factors": [
                f.get("feature") for f in (sc.top_shap_factors or [])
            ],
            "vsc_ratio": sc.vsc_ratio,
            "action_confidence": strategy.action_confidence,
            "median_finish": strategy.median_finish,
            "p10_finish": strategy.p10_finish,
            "p90_finish": strategy.p90_finish,
        }
    )
    # Pit laps override the PPO action client-side (historical replay truth);
    # honour an explicit client-provided action, otherwise use the model's.
    ctx.setdefault("recommended_action", strategy.recommended_action)

    engineer = _engineer_message_impl(models, ctx, body.recent_message_types)

    return LapTickResponse(
        next_lap=lap_pred,
        safety_car=sc,
        strategy=strategy,
        engineer=engineer,
    )


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
