"""
Gymnasium environment for Leclerc race strategy RL training.
"""

import os
import json
import gymnasium as gym
from gymnasium import spaces
import numpy as np
import pandas as pd
import torch
import joblib


class LeclercRaceEnv(gym.Env):
    metadata = {"render_modes": ["human"]}

    def __init__(self, data_path: str, models_dir: str):
        super().__init__()
        self.observation_space = spaces.Box(low=0.0, high=1.0, shape=(13,), dtype=np.float32)
        self.action_space = spaces.Discrete(4)
        self.data_path = data_path
        self.models_dir = models_dir
        self.df = pd.read_parquet(data_path) if os.path.exists(data_path) else pd.DataFrame()
        self._load_models()
        self.current_race = None
        self.lap_index = None
        self.race_state = None
        self.competitors = None
        self.np_random = np.random.default_rng()
        self.xgb_feature_names = None

    def _load_models(self):
        self.lstm_model = None
        self.xgb_model = None
        self.feature_builder = None
        self.lstm_config = None
        self.norm_stats = None
        self.xgb_feature_names = None

        norm_path = os.path.join(self.models_dir, "lstm_norm_stats.json")
        if os.path.exists(norm_path):
            with open(norm_path) as f:
                self.norm_stats = json.load(f)
            from backend.features.feature_builder import FeatureBuilder

            self.feature_builder = FeatureBuilder(self.norm_stats)
        else:
            import warnings

            warnings.warn("[LeclercRaceEnv] LSTM norm_stats not found; using fallback simulation.")

        config_path = os.path.join(self.models_dir, "lstm_config.json")
        weights_path = os.path.join(self.models_dir, "lstm_weights.pt")
        if os.path.exists(config_path) and os.path.exists(weights_path) and self.norm_stats:
            with open(config_path) as f:
                self.lstm_config = json.load(f)
            from backend.training.train_lstm import TyreDegradationLSTM

            self.lstm_model = TyreDegradationLSTM(**self.lstm_config)
            self.lstm_model.load_state_dict(torch.load(weights_path, map_location="cpu"))
            self.lstm_model.eval()

        xgb_path = os.path.join(self.models_dir, "xgb_sc_model.pkl")
        if os.path.exists(xgb_path):
            self.xgb_model = joblib.load(xgb_path)

        # Load XGB feature names once so inference vector matches training exactly.
        # Support both legacy placement (models_dir) and current repo placement (backend/data/models).
        for fn_path in (
            os.path.join(self.models_dir, "xgb_feature_names.json"),
            os.path.join(os.path.dirname(__file__), "..", "data", "models", "xgb_feature_names.json"),
        ):
            fn_path = os.path.normpath(fn_path)
            if os.path.exists(fn_path):
                try:
                    with open(fn_path) as f:
                        self.xgb_feature_names = json.load(f)
                except Exception:
                    self.xgb_feature_names = None
                break

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        if self.df.empty or "session_id" not in self.df.columns:
            obs = np.zeros(13, dtype=np.float32)
            return np.nan_to_num(obs, nan=0.0, posinf=1.0, neginf=0.0), {}

        sessions = self.df["session_id"].unique()
        chosen = self.np_random.choice(sessions)
        self.current_race = self.df[self.df["session_id"] == chosen].copy()
        self.current_race = self.current_race.sort_values("lap_number").reset_index(drop=True)
        total_laps = int(self.current_race["lap_number"].max())
        circuit_id = self.current_race["circuit_id"].iloc[0]
        year = int(self.current_race["year"].iloc[0])
        first = self.current_race.iloc[0]
        stint_n = int(first.get("stint_number", 1) or 1)

        self.race_state = {
            "lap_number": 1,
            "total_laps": total_laps,
            "position": int(first.get("position", 10)),
            "compound": int(first.get("compound", 1)),
            "tyre_age": 0,
            "fuel_load_kg": 110.0,
            "gap_ahead_seconds": float(first.get("gap_ahead_seconds", 0)),
            "gap_behind_seconds": float(first.get("gap_behind_seconds", 2)),
            "sc_probability": 0.05,
            "cliff_probability": 0.0,
            "laps_remaining": total_laps - 1,
            "soft_available": 1,
            "medium_available": 1,
            "hard_available": 1,
            "circuit_id": circuit_id,
            "year": year,
            "track_temp_celsius": float(first.get("track_temp_celsius", first.get("track_temp", 35.0))),
            "air_temp_celsius": float(first.get("air_temp_celsius", first.get("air_temp", 25.0))),
            "rainfall": int(first.get("rainfall", 0) or 0),
            "wind_speed": float(first.get("wind_speed", 0) or 0),
            "track_temp_delta": float(first.get("track_temp_delta", 0) or 0),
            "stint_number": stint_n,
            "stint_lap_history": [],
            "incidents_so_far": 0,
            "cumulative_time_lec": 0.0,
            "circuit_lt_mean": float(first.get("circuit_lt_mean", self.current_race["lap_time_seconds"].mean())),
            "circuit_lt_std": max(float(first.get("circuit_lt_std", 5.0)), 1.0),
            "track_evolution_index": 0.85 / (1 + np.exp(-12 * (1 / max(total_laps, 1) - 0.25))),
        }
        compounds_used = set(self.current_race["compound"].unique())
        self.race_state["soft_available"] = 1 if (0 in compounds_used or True) else 0
        self.race_state["medium_available"] = 1
        self.race_state["hard_available"] = 1 if (2 in compounds_used or True) else 0

        self._init_competitors()
        obs = (
            self.feature_builder.build_rl_observation(self.race_state)
            if self.feature_builder
            else np.zeros(13, dtype=np.float32)
        )
        return np.nan_to_num(obs, nan=0.0, posinf=1.0, neginf=0.0), {}

    def _init_competitors(self):
        session_mean = float(self.current_race["lap_time_seconds"].mean()) if len(self.current_race) else 92.0
        self.competitors = []
        lec_pos = int(self.race_state.get("position", 10))
        positions = [i for i in range(1, 21) if i != lec_pos]
        self.np_random.shuffle(positions)
        for pos in positions[:19]:
            offset = self.np_random.normal(0, 1.5)
            self.competitors.append({
                "position": pos,
                "cumulative_time": 0.0,
                "mean_lap_time": session_mean + offset,
                "tyre_compound": int(self.np_random.integers(0, 3)),
                "tyre_age": 0,
            })

    def _simulate_lap_time(self, stint_lap_history: list, state: dict) -> tuple[float, float, float]:
        try:
            if self.lstm_model is not None and self.feature_builder is not None and self.norm_stats is not None:
                from backend.features.feature_builder import stint_laps_circuit_lap_time_zscore
                from backend.training.train_lstm import build_lstm_sequence_from_laps

                c_m = float(state.get("circuit_lt_mean", 91.5))
                c_s = max(float(state.get("circuit_lt_std", 5.0)), 1e-8)
                z_hist = stint_laps_circuit_lap_time_zscore(stint_lap_history, c_m, c_s)
                numeric_seq, compound_seq = build_lstm_sequence_from_laps(z_hist, self.norm_stats)
                num_t = torch.FloatTensor(numeric_seq).unsqueeze(0)
                comp_t = torch.LongTensor(compound_seq).unsqueeze(0)
                with torch.no_grad():
                    out = self.lstm_model(num_t, comp_t)
                raw = out[0].numpy()
                pred_lt = float(raw[0]) * c_s + c_m
                deg_rate = float(raw[1]) * c_s * 10.0
                cliff_prob = float(torch.sigmoid(torch.tensor(raw[2])))
                return pred_lt, max(-2.0, min(8.0, deg_rate)), cliff_prob
        except Exception:
            # Never crash RL training due to model inference issues.
            pass

        session_mean = float(self.current_race["lap_time_seconds"].mean()) if len(self.current_race) else 92.0
        return session_mean + self.np_random.normal(0, 0.5), 0.15, 0.05

    def _predict_sc_probability(self, state: dict) -> float:
        try:
            if (
                self.xgb_model is not None
                and self.feature_builder is not None
                and self.xgb_feature_names
                and isinstance(self.xgb_feature_names, list)
            ):
                feats = self.feature_builder.build_xgb_features(state)
                feats["historical_sc_rate"] = 0.15
                X = np.array([[feats.get(n, 0) for n in self.xgb_feature_names]], dtype=np.float32)
                return float(self.xgb_model.predict_proba(X)[0, 1])
        except Exception:
            # Training must never crash due to XGB feature mismatch / inference failure.
            return 0.05
        return 0.05

    def _update_competitors(self, lec_cumulative_time: float) -> int:
        times = [lec_cumulative_time]
        for c in self.competitors:
            lap_t = c["mean_lap_time"] + self.np_random.normal(0, 0.4) + c.get("tyre_age", 0) * 0.02
            c["cumulative_time"] = c.get("cumulative_time", 0.0) + lap_t
            c["tyre_age"] = c.get("tyre_age", 0) + 1
            times.append(c["cumulative_time"])
        order = np.argsort(np.array(times))
        return int(np.where(order == 0)[0][0]) + 1

    def step(self, action: int):
        state = self.race_state
        reward = 0.0
        terminated = False
        truncated = False
        info = {"pitted": False, "cliff": False}

        if action == 1 and not state.get("soft_available", 1):
            reward -= 50.0
            action = 0
        if action == 2 and not state.get("medium_available", 1):
            reward -= 50.0
            action = 0
        if action == 3 and not state.get("hard_available", 1):
            reward -= 50.0
            action = 0

        tyre_age_before = int(state.get("tyre_age", 0))
        lap_number = int(state.get("lap_number", 1))
        compound_before = int(state.get("compound", 1))

        pit_time_loss = 0.0
        if action > 0:
            compound_map = {1: 0, 2: 1, 3: 2}
            state["compound"] = compound_map.get(action, compound_before)
            state["tyre_age"] = 0
            state["stint_lap_history"] = []
            pit_time_loss = 25.0
            state["stint_number"] = int(state.get("stint_number", 1)) + 1
            info["pitted"] = True
            info["new_compound"] = state.get("compound", 1)

        hist = state.get("stint_lap_history", []) or []
        lstm_input = hist[-10:] if hist else []
        predicted_lt, deg_rate, cliff_prob = self._simulate_lap_time(lstm_input, state)
        current_fuel = max(0.0, float(state.get("fuel_load_kg", 80.0)))
        actual_lt = predicted_lt + current_fuel * 0.033 + self.np_random.normal(0, 0.3)

        cliff_triggered = False
        if cliff_prob > 0.0 and tyre_age_before > 15:
            if self.np_random.random() < cliff_prob:
                actual_lt += self.np_random.uniform(0.8, 2.5)
                cliff_triggered = True
                info["cliff"] = True

        sc_prob = self._predict_sc_probability(state)
        state["sc_probability"] = float(sc_prob)
        # Cap SC sampling so episodes aren't dominated by chaos; still learn from SC pits
        sc_active = self.np_random.random() < min(float(sc_prob), 0.11)
        if sc_active:
            actual_lt = predicted_lt * 1.4
            state["incidents_so_far"] = state.get("incidents_so_far", 0) + 1
            if action > 0:
                reward += 20.0
                info["sc_pit_bonus"] = True
            state["gap_ahead_seconds"] = max(0.3, float(state.get("gap_ahead_seconds", 5.0)) * 0.7)
            state["gap_behind_seconds"] = max(0.3, float(state.get("gap_behind_seconds", 5.0)) * 0.7)

        if action > 0:
            min_age = 10
            if tyre_age_before < min_age:
                reward += -4.0 * (1.0 - tyre_age_before / min_age)
            elif lap_number < 8:
                reward -= 1.5

        if cliff_triggered:
            reward -= 5.0

        optimal_lengths = {0: 22, 1: 30, 2: 42}
        if action > 0:
            optimal = optimal_lengths.get(compound_before, 30)
            deviation = abs(tyre_age_before - optimal)
            reward += max(-1.0, 3.5 - deviation * 0.25)

        if state.get("rainfall", 0) == 1 and action > 0 and compound_before not in (3, 4):
            reward += 10.0

        lec_lap_total = actual_lt + pit_time_loss
        state["cumulative_time_lec"] = state.get("cumulative_time_lec", 0.0) + lec_lap_total
        prev_position = int(state.get("position", 10))
        new_position = self._update_competitors(state.get("cumulative_time_lec", 0.0))
        state["position"] = new_position
        reward += (prev_position - new_position) * 3.0

        state["lap_number"] = int(state.get("lap_number", 1)) + 1
        state["tyre_age"] = int(state.get("tyre_age", 0)) + 1
        state["fuel_load_kg"] = max(0.0, float(state.get("fuel_load_kg", 80.0)) - 1.6)
        state["laps_remaining"] = int(state.get("laps_remaining", 0)) - 1
        state["cliff_probability"] = float(cliff_prob)
        total = int(state.get("lap_number", 1)) + int(state.get("laps_remaining", 0))
        state["track_evolution_index"] = 0.85 / (
            1 + np.exp(-12 * (state.get("lap_number", 1) / max(total, 1) - 0.25))
        )

        lap_record = {
            "lap_time_seconds": actual_lt,
            "compound": state.get("compound", 1),
            "tyre_age": state.get("tyre_age", 0),
            "fuel_load_kg": state.get("fuel_load_kg", 80.0),
            "track_temp_celsius": state.get("track_temp_celsius", 35.0),
            "air_temp_celsius": state.get("air_temp_celsius", 25.0),
            "gap_ahead_seconds": state.get("gap_ahead_seconds", 0.0),
            "gap_behind_seconds": state.get("gap_behind_seconds", 0.0),
            "safety_car_active": int(sc_active),
            "wind_speed": state.get("wind_speed", 0.0),
            "fresh_tyre": 1 if int(state.get("tyre_age", 1)) <= 1 else 0,
            "track_evolution_index": state.get("track_evolution_index", 0.0),
        }
        hist = state.get("stint_lap_history", [])
        hist.append(lap_record)
        state["stint_lap_history"] = hist

        # Dense signal: small reward each lap so returns aren't buried under sparse penalties
        reward += 0.65

        if int(state.get("laps_remaining", 0)) <= 0:
            terminated = True
            fp = int(state.get("position", 10))
            position_rewards = {1: 120, 2: 85, 3: 60, 4: 40, 5: 28, 6: 18, 7: 12, 8: 8, 9: 5, 10: 3}
            pos_r = position_rewards.get(fp, max(0, 8 - (fp - 10)))
            reward += 22.0 + pos_r
            info["final_position"] = fp

        if np.isnan(reward):
            reward = 0.0
        obs = (
            self.feature_builder.build_rl_observation(state)
            if self.feature_builder
            else np.zeros(13, dtype=np.float32)
        )
        return obs, float(reward), terminated, truncated, info
