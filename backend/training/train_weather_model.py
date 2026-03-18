"""
Train weather lap delta and SC risk multiplier models.
Run: python -m backend.training.train_weather_model
"""

import os
import json
import numpy as np
import pandas as pd
import joblib
from sklearn.ensemble import GradientBoostingRegressor

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.environ.get("DATA_DIR", os.path.join(_BACKEND_DIR, "data", "processed"))
MODELS_DIR = os.environ.get("MODEL_DIR", os.path.join(_BACKEND_DIR, "data", "models"))
PARQUET_PATH = os.path.join(DATA_DIR, "leclerc_career_laps.parquet")


def main():
    from backend.features.feature_builder import CIRCUIT_ENCODING

    os.makedirs(MODELS_DIR, exist_ok=True)
    if not os.path.exists(PARQUET_PATH):
        print("Parquet missing. Run clean_data.")
        return

    df = pd.read_parquet(PARQUET_PATH)
    df = df[df["exclude_from_lstm_training"] == 0].copy()
    if len(df) < 100:
        print("Too few clean laps for weather model.")
        return

    tt = pd.to_numeric(df.get("track_temp_celsius", df.get("track_temp", 35)), errors="coerce").fillna(35.0)
    at = pd.to_numeric(df.get("air_temp_celsius", df.get("air_temp", 25)), errors="coerce").fillna(25.0)
    df["track_temp"] = tt
    df["air_temp"] = at
    df["temp_delta"] = df["track_temp"] - df["air_temp"]
    df["is_cool_track"] = (df["track_temp"] < 25.0).astype(int)
    df["is_hot_track"] = (df["track_temp"] > 45.0).astype(int)
    df["rainfall_binary"] = pd.to_numeric(df.get("rainfall", 0), errors="coerce").fillna(0).astype(int)
    ws = pd.to_numeric(df.get("wind_speed", 0), errors="coerce").fillna(0.0)
    df["wind_speed"] = ws
    df["wind_chill_factor"] = df["air_temp"] - (df["wind_speed"] * 0.3)
    df["track_temp_delta"] = pd.to_numeric(df.get("track_temp_delta", 0), errors="coerce").fillna(0.0)
    df["fuel_correction"] = pd.to_numeric(df["fuel_load_kg"], errors="coerce").fillna(50.0) * 0.033
    df["expected_lt"] = pd.to_numeric(df["circuit_lt_mean"], errors="coerce").fillna(92.0) + df["fuel_correction"]
    df["weather_lap_delta"] = pd.to_numeric(df["lap_time_seconds"], errors="coerce") - df["expected_lt"]

    df["circuit_encoded"] = (
        df["circuit_id"].astype(str).str.lower().map(lambda x: CIRCUIT_ENCODING.get(x, 0)).fillna(0).astype(int)
    )
    total = df["lap_number"] + df["laps_remaining"].clip(lower=0)
    df["lap_fraction"] = df["lap_number"] / total.replace(0, 1)

    feat_lap = [
        "track_temp",
        "air_temp",
        "temp_delta",
        "rainfall_binary",
        "wind_speed",
        "track_temp_delta",
        "is_cool_track",
        "is_hot_track",
        "circuit_encoded",
        "lap_fraction",
    ]
    X_lap = df[feat_lap].astype(float).fillna(0)
    y_lap = df["weather_lap_delta"].astype(float).clip(-30, 30)
    m1 = GradientBoostingRegressor(n_estimators=200, max_depth=4, learning_rate=0.05, random_state=42)
    m1.fit(X_lap, y_lap)
    joblib.dump({"model": m1, "feature_names": feat_lap}, os.path.join(MODELS_DIR, "weather_lap_model.pkl"))

    df2 = pd.read_parquet(PARQUET_PATH)
    df2 = df2.sort_values(["session_id", "lap_number"])
    df2["roll_sc"] = df2.groupby("session_id", group_keys=False)["safety_car_active"].transform(
        lambda x: x.rolling(5, min_periods=1, center=True).mean()
    )
    baseline = df2[df2.get("rainfall", 0) == 0].groupby("circuit_id")["safety_car_active"].mean()
    df2["b"] = df2["circuit_id"].map(baseline).fillna(0.06)
    df2["sc_risk_multiplier"] = (df2["roll_sc"] + 0.03) / (df2["b"] + 0.03)
    df2["sc_risk_multiplier"] = df2["sc_risk_multiplier"].clip(0.5, 5.0)

    tt2 = pd.to_numeric(df2.get("track_temp_celsius", df2.get("track_temp", 35)), errors="coerce").fillna(35.0)
    at2 = pd.to_numeric(df2.get("air_temp_celsius", df2.get("air_temp", 25)), errors="coerce").fillna(25.0)
    df2["track_temp"] = tt2
    df2["air_temp"] = at2
    df2["track_temp_delta"] = pd.to_numeric(df2.get("track_temp_delta", 0), errors="coerce").fillna(0.0)
    df2["wind_speed"] = pd.to_numeric(df2.get("wind_speed", 0), errors="coerce").fillna(0.0)
    df2["is_cool_track"] = (df2["track_temp"] < 25.0).astype(int)
    df2["rainfall_binary"] = pd.to_numeric(df2.get("rainfall", 0), errors="coerce").fillna(0).astype(int)
    df2["circuit_encoded"] = (
        df2["circuit_id"].astype(str).str.lower().map(lambda x: CIRCUIT_ENCODING.get(x, 0)).fillna(0).astype(int)
    )
    t2 = df2["lap_number"] + df2["laps_remaining"].clip(lower=0)
    df2["lap_fraction"] = df2["lap_number"] / t2.replace(0, 1)

    feat_sc = [
        "track_temp",
        "air_temp",
        "rainfall_binary",
        "wind_speed",
        "track_temp_delta",
        "is_cool_track",
        "circuit_encoded",
        "lap_fraction",
        "rainfall_binary",
    ]
    feat_sc_unique = []
    seen = set()
    for f in feat_sc:
        if f not in seen:
            feat_sc_unique.append(f)
            seen.add(f)
    X_sc = df2[feat_sc_unique].astype(float).fillna(0)
    y_sc = df2["sc_risk_multiplier"].astype(float)
    m2 = GradientBoostingRegressor(n_estimators=150, max_depth=3, learning_rate=0.05, random_state=43)
    m2.fit(X_sc, y_sc)
    joblib.dump({"model": m2, "feature_names": feat_sc_unique}, os.path.join(MODELS_DIR, "weather_sc_model.pkl"))

    meta = {"lap_features": feat_lap, "sc_features": feat_sc_unique}
    with open(os.path.join(MODELS_DIR, "weather_model_meta.json"), "w") as f:
        json.dump(meta, f, indent=2)
    print("[weather] Saved weather_lap_model.pkl and weather_sc_model.pkl")

    try:
        from backend.training.model_versioning import update_model_versions
        from datetime import datetime

        update_model_versions(
            MODELS_DIR,
            "weather",
            "weather_lap_model.pkl",
            {"trained": datetime.utcnow().isoformat()},
        )
    except Exception:
        pass


if __name__ == "__main__":
    main()
