"""Registry that loads and holds LSTM, XGBoost, and PPO models at server startup."""

import os
import json

from .lstm_model import LSTMModel
from .xgb_model import XGBModel
from .rl_policy import RLPolicy
from .weather_model import WeatherModel


class ModelRegistry:
    """
    Loads LSTM, XGBoost, and PPO from disk and exposes them for inference.
    Also initialises simulator, Monte Carlo engine, and radio generator.
    """

    def __init__(self, models_dir: str | None = None) -> None:
        self.models_dir = models_dir or os.environ.get("MODEL_DIR", "backend/data/models")
        self.lstm: LSTMModel | None = None
        self.xgb: XGBModel | None = None
        self.ppo: RLPolicy | None = None
        self.feature_builder = None
        self.norm_stats = None
        self.simulator = None
        self.monte_carlo = None
        self.radio = None
        self.circuit_lap_by_id: dict = {}
        self.weather: WeatherModel | None = None

    def load_all(self) -> None:
        """Load all models and wire simulator, Monte Carlo, radio. Called once at server startup."""
        self.lstm = LSTMModel(self.models_dir)
        self.lstm.load()

        self.xgb = XGBModel(self.models_dir)
        self.xgb.load()

        self.ppo = RLPolicy(self.models_dir)
        self.ppo.load()

        self.weather = WeatherModel(self.models_dir)
        self.weather.load()

        norm_path = os.path.join(self.models_dir, "lstm_norm_stats.json")
        if os.path.exists(norm_path):
            with open(norm_path) as f:
                self.norm_stats = json.load(f)
            from backend.features.feature_builder import FeatureBuilder
            self.feature_builder = FeatureBuilder(self.norm_stats)
        else:
            print("[ModelRegistry] WARNING: norm_stats not found; FeatureBuilder not initialised.")

        from backend.simulation.race_sim import RaceSimulator
        from backend.simulation.monte_carlo import MonteCarloEngine
        self.simulator = RaceSimulator(
            self.lstm.model if self.lstm and self.lstm.loaded else None,
            self.xgb.model if self.xgb and self.xgb.loaded else None,
            self.ppo.model if self.ppo and self.ppo.loaded else None,
            self.feature_builder,
            self.norm_stats,
            self.models_dir,
        )
        self.monte_carlo = MonteCarloEngine(self.simulator)

        from backend.engineer.radio_generator import RadioGenerator
        self.radio = RadioGenerator()

        circ_path = os.path.join(self.models_dir, "circuit_lap_stats.json")
        if os.path.exists(circ_path):
            with open(circ_path) as f:
                rows = json.load(f)
            self.circuit_lap_by_id = {
                str(r.get("circuit_id", "")).lower(): r for r in rows if r.get("circuit_id") is not None
            }
        else:
            self.circuit_lap_by_id = {}

        # Load circuit track maps from data/processed
        circuit_maps_path = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), "data", "processed", "circuit_track_maps.json"
        )
        self.circuit_track_maps = {}
        if os.path.exists(circuit_maps_path):
            with open(circuit_maps_path) as f:
                self.circuit_track_maps = json.load(f)
            print(f"[ModelRegistry] Loaded {len(self.circuit_track_maps)} circuit track maps.")
            for k in sorted(self.circuit_track_maps.keys()):
                print(f"[ModelRegistry] circuit_map_key: {k}")

        print("[ModelRegistry] All components loaded.")

    @property
    def ready(self) -> bool:
        return (
            self.lstm is not None
            and self.xgb is not None
            and self.ppo is not None
        )
