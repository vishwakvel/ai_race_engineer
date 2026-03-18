"""
Centralised feature construction for training and inference.
Stateless: normalization parameters are passed in, not computed here.
"""

from __future__ import annotations

import json
import os
import numpy as np

CIRCUIT_ENCODING = {
    "bahrain": 0,
    "jeddah": 1,
    "albert_park": 2,
    "imola": 3,
    "miami": 4,
    "monaco": 5,
    "catalunya": 6,
    "silverstone": 7,
    "hungaroring": 8,
    "spa": 9,
    "zandvoort": 10,
    "monza": 11,
    "marina_bay": 12,
    "suzuka": 13,
    "lusail": 14,
    "americas": 15,
    "rodriguez": 16,
    "interlagos": 17,
    "vegas": 18,
    "yas_marina": 19,
    "bahrain_outer": 20,
    "mugello": 21,
    "portimao": 22,
    "nurburgring": 23,
    "istanbul": 24,
    "sakhir": 25,
    "baku": 26,
    "shanghai": 27,
    "red_bull_ring": 28,
    "paul_ricard": 29,
    "hockenheimring": 30,
}

COMPOUND_HARDNESS = {0: 0, 1: 1, 2: 2, 3: 1.5, 4: 1}


def stint_laps_circuit_lap_time_zscore(
    stint_laps: list[dict], circuit_lt_mean: float, circuit_lt_std: float
) -> list[dict]:
    """Convert raw lap_time_seconds to per-circuit z-scores (matches training parquet feature)."""
    c_m = float(circuit_lt_mean)
    c_s = max(float(circuit_lt_std), 1e-8)
    out = []
    for lap in stint_laps or []:
        d = dict(lap)
        raw = float(d.get("lap_time_seconds", c_m))
        d["lap_time_seconds"] = (raw - c_m) / c_s
        out.append(d)
    return out


class FeatureBuilder:
    """
    Builds feature arrays from raw lap dictionaries.
    Normalization stats must be provided at construction time.
    """

    NUMERIC_FEATURES = [
        "lap_time_seconds",
        "tyre_age",
        "fuel_load_kg",
        "track_temp_celsius",
        "air_temp_celsius",
        "gap_ahead_seconds",
        "gap_behind_seconds",
        "safety_car_active",
        "wind_speed",
        "fresh_tyre",
    ]

    def __init__(self, norm_stats: dict):
        """
        norm_stats: dict with keys matching NUMERIC_FEATURES,
                    each value is {'mean': float, 'std': float}
        """
        self.norm_stats = norm_stats

    def normalize_feature(self, value: float, feature_name: str) -> float:
        """Z-score normalization using stored stats."""
        if feature_name not in self.norm_stats:
            return float(value)
        stats = self.norm_stats[feature_name]
        mean = stats.get("mean", 0.0)
        std = stats.get("std", 1.0)
        return (float(value) - mean) / (std + 1e-8)

    def lap_dict_to_feature_vector(self, lap: dict) -> tuple[list[float], int]:
        numeric = [
            self.normalize_feature(float(lap.get("lap_time_seconds", 0)), "lap_time_seconds"),
            self.normalize_feature(float(lap.get("tyre_age", 0)), "tyre_age"),
            self.normalize_feature(float(lap.get("fuel_load_kg", 80)), "fuel_load_kg"),
            self.normalize_feature(
                float(lap.get("track_temp_celsius", lap.get("track_temp", 35))), "track_temp_celsius"
            ),
            self.normalize_feature(
                float(lap.get("air_temp_celsius", lap.get("air_temp", 25))), "air_temp_celsius"
            ),
            self.normalize_feature(
                min(float(lap.get("gap_ahead_seconds", 0)), 120.0), "gap_ahead_seconds"
            ),
            self.normalize_feature(
                min(float(lap.get("gap_behind_seconds", 0)), 120.0), "gap_behind_seconds"
            ),
            float(lap.get("safety_car_active", 0)),
            self.normalize_feature(float(lap.get("wind_speed", 0)), "wind_speed"),
            float(lap.get("fresh_tyre", 1)),  # binary — do not z-score (avoids div-by-near-zero)
        ]
        compound_id = int(lap.get("compound", 0))
        compound_id = max(0, min(4, compound_id))
        return numeric, compound_id

    def build_sequence(
        self,
        laps: list[dict],
        sequence_length: int = 10,
    ) -> tuple[np.ndarray, np.ndarray]:
        numeric_seq = np.zeros((sequence_length, len(self.NUMERIC_FEATURES)), dtype=np.float32)
        compound_seq = np.zeros(sequence_length, dtype=np.int64)

        start_idx = max(0, sequence_length - len(laps))
        laps_to_use = laps[-sequence_length:]

        for i, lap in enumerate(laps_to_use):
            vec, comp = self.lap_dict_to_feature_vector(lap)
            numeric_seq[start_idx + i] = vec
            compound_seq[start_idx + i] = comp

        return numeric_seq, compound_seq

    def build_xgb_features(self, state: dict) -> dict:
        lap_number = float(state.get("lap_number", 1))
        laps_remaining = float(state.get("laps_remaining", 30))
        total = lap_number + laps_remaining
        lap_fraction = lap_number / max(total, 1)

        circuit_encoded = state.get("circuit_encoded")
        if circuit_encoded is None and "circuit_id" in state:
            circuit_encoded = float(CIRCUIT_ENCODING.get(str(state.get("circuit_id", "")).lower(), 0))
        elif circuit_encoded is None:
            circuit_encoded = 0.0
        circuit_encoded = float(circuit_encoded)

        cid = str(state.get("circuit_id", "")).lower()
        battle = 2.2
        md = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "models", "circuit_battle_intensity.json")
        if os.path.exists(md):
            try:
                with open(md) as f:
                    bd = json.load(f)
                battle = float(bd.get(cid, bd.get(state.get("circuit_id", ""), 2.2)))
            except Exception:
                pass

        fts = state.get("field_tyre_stress_index")
        if fts is None:
            comp = int(state.get("compound", 1))
            h = float(COMPOUND_HARDNESS.get(comp, 1))
            fts = float(state.get("tyre_age", 0)) / (h + 1.0)
        else:
            fts = float(fts)

        return {
            "lap_number": lap_number,
            "laps_remaining": laps_remaining,
            "circuit_encoded": circuit_encoded,
            "track_temp": float(state.get("track_temp_celsius", state.get("track_temp", 35.0))),
            "air_temp": float(state.get("air_temp_celsius", state.get("air_temp", 25.0))),
            "rainfall": float(state.get("rainfall", 0)),
            "incidents_so_far": float(state.get("incidents_so_far", 0)),
            "cars_within_2s": float(state.get("cars_within_2s", battle)),
            "mean_tyre_age_field": float(state.get("mean_tyre_age_field", 15)),
            "year": float(state.get("year", 2024)),
            "lap_fraction": lap_fraction,
            "field_tyre_stress_index": fts,
            "wind_speed": float(state.get("wind_speed", 0.0)),
            "track_temp_delta": float(state.get("track_temp_delta", 0.0)),
        }

    def build_rl_observation(self, state: dict) -> np.ndarray:
        lap_num = float(state.get("lap_number", 1))
        laps_rem = float(state.get("laps_remaining", 30))
        total_laps = max(lap_num + laps_rem, 1)

        obs = np.array(
            [
                lap_num / total_laps,
                laps_rem / total_laps,
                float(state.get("position", 10)) / 20.0,
                float(state.get("compound", 1)) / 4.0,
                min(float(state.get("tyre_age", 0)) / 60.0, 1.0),
                min(float(state.get("fuel_load_kg", 80)) / 110.0, 1.0),
                min(float(state.get("gap_ahead_seconds", 0)) / 30.0, 1.0),
                min(float(state.get("gap_behind_seconds", 0)) / 30.0, 1.0),
                float(state.get("sc_probability", 0.0)),
                float(state.get("cliff_probability", 0.0)),
                float(state.get("soft_available", 1)),
                float(state.get("hard_available", 1)),
                np.clip(float(state.get("stint_number", 1)) / 3.0, 0.0, 1.0),
            ],
            dtype=np.float32,
        )
        obs = np.nan_to_num(obs, nan=0.0, posinf=1.0, neginf=0.0)
        return obs


def compute_norm_stats(df) -> dict:
    stats = {}
    for feature in FeatureBuilder.NUMERIC_FEATURES:
        col_name = feature
        if feature == "track_temp_celsius" and feature not in df.columns and "track_temp" in df.columns:
            col_name = "track_temp"
        if feature == "air_temp_celsius" and feature not in df.columns and "air_temp" in df.columns:
            col_name = "air_temp"
        if feature == "fresh_tyre":
            stats[feature] = {"mean": 0.5, "std": 0.5}
        elif col_name in df.columns:
            col = df[col_name].astype(float)
            if feature == "track_temp_celsius":
                col = col.fillna(col.median()).fillna(35.0)
            elif feature == "air_temp_celsius":
                col = col.fillna(col.median()).fillna(25.0)
            lo = 5.0 if feature == "wind_speed" else 1e-6
            m = float(col.mean())
            s = float(max(col.std(), lo))
            if not (m == m and s == s) or s <= 0:
                m, s = (35.0, 10.0) if feature == "track_temp_celsius" else (25.0, 8.0) if feature == "air_temp_celsius" else (0.0, 1.0)
            stats[feature] = {"mean": m, "std": s}
        else:
            stats[feature] = {"mean": 0.0, "std": 1.0}
    return stats
