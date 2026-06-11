"""Pydantic request/response models for the LeclercAI API."""

from typing import Any

from pydantic import BaseModel, Field


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
    n_simulations: int = Field(default=500, ge=1, le=500)


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


class LapTickRequest(BaseModel):
    """Aggregate request — one round trip per lap instead of four."""

    next_lap: NextLapRequest
    safety_car: SafetyCarRequest
    strategy: StrategyRecommendRequest
    engineer_context: dict[str, Any] = Field(default_factory=dict)
    recent_message_types: list[str] = Field(default_factory=list)


class LapTickResponse(BaseModel):
    next_lap: dict[str, Any]
    safety_car: SafetyCarResponse
    strategy: StrategyRecommendResponse
    engineer: dict[str, Any]


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
