"""LSTM model for tyre degradation and lap time prediction."""

import os
import json
import torch

AGE_CLIFF_THRESHOLDS = {0: 25, 1: 38, 2: 52, 3: 15, 4: 10}


class LSTMModel:
    def __init__(self, models_dir: str) -> None:
        self.models_dir = models_dir
        self.model = None
        self.norm_stats = None
        self.loaded = False

    def load(self) -> None:
        weights_path = os.path.join(self.models_dir, "lstm_weights.pt")
        config_path = os.path.join(self.models_dir, "lstm_config.json")
        norm_path = os.path.join(self.models_dir, "lstm_norm_stats.json")
        if not all(os.path.exists(p) for p in [weights_path, config_path, norm_path]):
            print("[LSTMModel] WARNING: Model files not found. Using fallback.")
            return
        with open(config_path) as f:
            config = json.load(f)
        with open(norm_path) as f:
            self.norm_stats = json.load(f)
        from backend.training.train_lstm import TyreDegradationLSTM

        self.model = TyreDegradationLSTM(**config)
        self.model.load_state_dict(torch.load(weights_path, map_location="cpu"))
        self.model.eval()
        self.loaded = True
        print("[LSTMModel] Loaded successfully.")

    def predict(self, stint_laps: list[dict], current_state: dict | None = None) -> dict:
        import random

        if not self.loaded:
            return {
                "predicted_lap_time": 92.0 + random.gauss(0, 0.5),
                "deg_rate": 0.15,
                "cliff_probability": 0.05,
            }
        from backend.features.feature_builder import stint_laps_circuit_lap_time_zscore
        from backend.training.train_lstm import build_lstm_sequence_from_laps

        cs = current_state or {}
        lt_mean = float(cs.get("circuit_lt_mean", 91.5))
        lt_std = max(float(cs.get("circuit_lt_std", 5.0)), 1e-8)
        z_laps = stint_laps_circuit_lap_time_zscore(stint_laps or [], lt_mean, lt_std)
        numeric_seq, compound_seq = build_lstm_sequence_from_laps(z_laps, self.norm_stats)
        numeric_tensor = torch.FloatTensor(numeric_seq).unsqueeze(0)
        compound_tensor = torch.LongTensor(compound_seq).unsqueeze(0)
        with torch.no_grad():
            output = self.model(numeric_tensor, compound_tensor)
        raw = output[0].numpy()
        predicted_lt = float(raw[0]) * lt_std + lt_mean
        raw_deg = float(raw[1])
        circuit_std = float(cs.get("circuit_lt_std", self.norm_stats.get("lap_time_seconds", {}).get("std", lt_std)))
        deg_rate_tenths = raw_deg * max(circuit_std, 1e-8) * 10.0
        deg_rate_tenths = max(-2.0, min(8.0, deg_rate_tenths))

        raw_cliff = float(torch.sigmoid(torch.tensor(raw[2])).item())
        tyre_age = int(cs.get("tyre_age", 0))
        compound = int(cs.get("compound", 1))
        stint_number = int(cs.get("stint_number", 1))
        threshold = AGE_CLIFF_THRESHOLDS.get(compound, 38)
        if stint_number == 1:
            cliff_prob = min(raw_cliff, 0.08)
            cliff_prob = max(0.02, cliff_prob)
        elif tyre_age > threshold:
            age_over = tyre_age - threshold
            age_cliff_prob = min(0.80, 0.15 + (age_over / 20.0) * 0.65)
            cliff_prob = max(raw_cliff, age_cliff_prob)
        else:
            cliff_prob = raw_cliff

        return {
            "predicted_lap_time": predicted_lt,
            "deg_rate": deg_rate_tenths,
            "cliff_probability": cliff_prob,
        }
