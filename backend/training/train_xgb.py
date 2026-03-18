"""
Train XGBoost safety car probability classifier; calibrate and save.
Run: python -m backend.training.train_xgb
"""

import os
import json
import numpy as np
import pandas as pd
import joblib
import xgboost as xgb
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import roc_auc_score, brier_score_loss

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.environ.get("DATA_DIR", os.path.join(_BACKEND_DIR, "data", "processed"))
MODELS_DIR = os.environ.get("MODEL_DIR", os.path.join(_BACKEND_DIR, "data", "models"))
PARQUET_PATH = os.path.join(DATA_DIR, "leclerc_career_laps.parquet")

XGB_FEATURE_NAMES = [
    "lap_number",
    "laps_remaining",
    "circuit_encoded",
    "track_temp",
    "air_temp",
    "rainfall",
    "incidents_so_far",
    "cars_within_2s",
    "mean_tyre_age_field",
    "year",
    "lap_fraction",
    "field_tyre_stress_index",
    "wind_speed",
    "track_temp_delta",
    "historical_sc_rate",
]

DEFAULT_BATTLE_INTENSITY = 2.2


def main():
    from backend.features.feature_builder import CIRCUIT_ENCODING

    os.makedirs(MODELS_DIR, exist_ok=True)
    if not os.path.exists(PARQUET_PATH):
        print("Parquet not found. Run clean_data first.")
        return

    df = pd.read_parquet(PARQUET_PATH)
    df["track_temp"] = df.get("track_temp_celsius", df.get("track_temp", 35.0))
    df["air_temp"] = df.get("air_temp_celsius", df.get("air_temp", 25.0))
    if "rainfall" not in df.columns:
        df["rainfall"] = 0
    if "wind_speed" not in df.columns:
        df["wind_speed"] = 0.0
    df["wind_speed"] = pd.to_numeric(df["wind_speed"], errors="coerce").fillna(0.0)
    if "track_temp_delta" not in df.columns:
        df["track_temp_delta"] = 0.0
    df["track_temp_delta"] = pd.to_numeric(df["track_temp_delta"], errors="coerce").fillna(0.0)
    if "field_tyre_stress_index" not in df.columns:
        from backend.features.feature_builder import COMPOUND_HARDNESS

        h = df["compound"].map(COMPOUND_HARDNESS).fillna(1)
        df["field_tyre_stress_index"] = df["tyre_age"] / (h + 1)

    df["sc_in_next_3"] = 0
    for (sid,), g in df.groupby(["session_id"]):
        g = g.sort_values("lap_number")
        idx = g.index
        for i in range(len(g) - 3):
            window = g.iloc[i + 1 : i + 4]
            if window["safety_car_active"].max() == 1:
                df.loc[idx[i], "sc_in_next_3"] = 1

    df["circuit_encoded"] = (
        df["circuit_id"].astype(str).str.lower().map(lambda x: CIRCUIT_ENCODING.get(x, 0)).fillna(0).astype(int)
    )

    df["incidents_so_far"] = 0
    for (sid,), g in df.groupby(["session_id"]):
        prev_sc = False
        count = 0
        for i in g.sort_values("lap_number").index:
            sc = df.loc[i, "safety_car_active"] == 1
            if sc and not prev_sc:
                count += 1
            df.loc[i, "incidents_so_far"] = count
            prev_sc = sc

    battle_path = os.path.join(MODELS_DIR, "circuit_battle_intensity.json")
    if os.path.exists(battle_path):
        with open(battle_path) as f:
            battle_dict = json.load(f)
    else:
        midfield = df[(df["position"] >= 5) & (df["position"] <= 15)]
        battle_intensity = midfield.groupby("circuit_id")["gap_behind_seconds"].mean()
        battle_dict = {str(k).lower(): float(v) for k, v in battle_intensity.fillna(2.2).items()}

    df["cars_within_2s"] = df["circuit_id"].astype(str).str.lower().map(
        lambda x: float(battle_dict.get(x, DEFAULT_BATTLE_INTENSITY))
    )

    mean_tyre_by_lap = df.groupby("lap_number")["tyre_age"].mean().to_dict()
    df["mean_tyre_age_field"] = df["lap_number"].map(mean_tyre_by_lap).fillna(15)

    df["lap_fraction"] = df["lap_number"] / (df["lap_number"] + df["laps_remaining"].clip(lower=0)).replace(0, 1)

    df["lap_window_10"] = (df["lap_number"] // 10) * 10
    window_max = df.groupby(["session_id", "circuit_id", "lap_window_10"])["safety_car_active"].max().reset_index()
    hist = window_max.groupby(["circuit_id", "lap_window_10"])["safety_car_active"].mean().reset_index()
    hist.columns = ["circuit_id", "lap_window_10", "historical_sc_rate"]
    df = df.merge(hist, on=["circuit_id", "lap_window_10"], how="left")
    df["historical_sc_rate"] = df["historical_sc_rate"].fillna(0.15)

    last_laps = df.groupby("session_id")["lap_number"].transform("max")
    valid = df["lap_number"] <= last_laps - 3

    train_mask = (df["year"] >= 2018) & (df["year"] <= 2022) & valid
    val_mask = (df["year"] == 2023) & valid
    test_mask = (df["year"] == 2024) & valid

    X_train = df.loc[train_mask, XGB_FEATURE_NAMES].astype(float).fillna(0)
    y_train = df.loc[train_mask, "sc_in_next_3"]
    X_val = df.loc[val_mask, XGB_FEATURE_NAMES].astype(float).fillna(0)
    y_val = df.loc[val_mask, "sc_in_next_3"]
    X_test = df.loc[test_mask, XGB_FEATURE_NAMES].astype(float).fillna(0)
    y_test = df.loc[test_mask, "sc_in_next_3"]

    if y_train.sum() == 0:
        scale_pos_weight = 1.0
    else:
        scale_pos_weight = float((y_train == 0).sum()) / max((y_train == 1).sum(), 1)

    base_model = xgb.XGBClassifier(
        n_estimators=400,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=scale_pos_weight,
        eval_metric="logloss",
        early_stopping_rounds=20,
        random_state=42,
        tree_method="hist",
    )

    base_model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=50)

    calibrated = CalibratedClassifierCV(base_model, method="isotonic", cv="prefit")
    calibrated.fit(X_val, y_val)

    lr_pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("lr", LogisticRegression(C=0.1, class_weight="balanced", max_iter=1000)),
    ])
    lr_pipeline.fit(X_train, y_train)
    lr_cal = CalibratedClassifierCV(lr_pipeline, method="isotonic", cv="prefit")
    lr_cal.fit(X_val, y_val)

    joblib.dump(calibrated, os.path.join(MODELS_DIR, "xgb_sc_model.pkl"))
    joblib.dump(lr_cal, os.path.join(MODELS_DIR, "lr_sc_model.pkl"))
    with open(os.path.join(MODELS_DIR, "xgb_feature_names.json"), "w") as f:
        json.dump(XGB_FEATURE_NAMES, f, indent=2)
    with open(os.path.join(MODELS_DIR, "xgb_circuit_encoding.json"), "w") as f:
        json.dump(CIRCUIT_ENCODING, f, indent=2)
    with open(os.path.join(MODELS_DIR, "circuit_battle_intensity.json"), "w") as f:
        json.dump({**battle_dict, "_default": DEFAULT_BATTLE_INTENSITY}, f, indent=2)
    with open(os.path.join(MODELS_DIR, "mean_tyre_age_by_lap.json"), "w") as f:
        json.dump(mean_tyre_by_lap, f, indent=2)

    def ensemble_predict_proba(X):
        p_xgb = calibrated.predict_proba(X)[:, 1]
        p_lr = lr_cal.predict_proba(X)[:, 1]
        return 0.7 * p_xgb + 0.3 * p_lr

    proba_test = ensemble_predict_proba(X_test)
    auc = roc_auc_score(y_test, proba_test) if y_test.nunique() > 1 else 0.0
    brier = brier_score_loss(y_test, proba_test)
    print(f"[XGBoost+LR] Ensemble AUC: {auc:.2f} | Brier: {brier:.2f} | Calibration OK")

    try:
        from backend.training.model_versioning import save_timestamped_copy, update_model_versions
        from datetime import datetime

        ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        wcopy = save_timestamped_copy(MODELS_DIR, "xgb_sc_model.pkl", ts)
        if wcopy:
            update_model_versions(MODELS_DIR, "xgb", wcopy, {"auc": auc, "brier": brier})
    except Exception as e:
        print("[XGB] model versioning skip:", e)


if __name__ == "__main__":
    main()
