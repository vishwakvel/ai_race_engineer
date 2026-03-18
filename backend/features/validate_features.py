"""
Run after retraining to verify train-serve consistency.
Usage: python -m backend.features.validate_features
"""

import json
import os
import sys
import numpy as np

_BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS = os.path.join(_BACKEND, "data", "models")


def main():
    sys.path.insert(0, os.path.dirname(os.path.dirname(_BACKEND)))
    from backend.features.feature_builder import FeatureBuilder, CIRCUIT_ENCODING
    from backend.training.train_xgb import XGB_FEATURE_NAMES

    fails = []

    cfg_path = os.path.join(MODELS, "lstm_config.json")
    norm_path = os.path.join(MODELS, "lstm_norm_stats.json")
    xgb_names_path = os.path.join(MODELS, "xgb_feature_names.json")

    if not os.path.exists(cfg_path):
        print("FAIL: lstm_config.json missing")
        return 1
    with open(cfg_path) as f:
        cfg = json.load(f)
    n_num = len(FeatureBuilder.NUMERIC_FEATURES)
    if int(cfg.get("input_size", 0)) != n_num:
        fails.append(f"lstm input_size {cfg.get('input_size')} != len(NUMERIC_FEATURES) {n_num}")

    if os.path.exists(norm_path):
        with open(norm_path) as f:
            ns = json.load(f)
        for k in FeatureBuilder.NUMERIC_FEATURES:
            if k not in ns:
                fails.append(f"norm_stats missing {k}")
    else:
        fails.append("lstm_norm_stats.json missing")

    if os.path.exists(xgb_names_path):
        with open(xgb_names_path) as f:
            saved = json.load(f)
        if saved != XGB_FEATURE_NAMES:
            fails.append(f"xgb_feature_names mismatch: file={saved} code={XGB_FEATURE_NAMES}")
    else:
        fails.append("xgb_feature_names.json missing")

    # LSTM inference smoke
    try:
        import torch
        from backend.training.train_lstm import TyreDegradationLSTM, build_lstm_sequence_from_laps

        wpath = os.path.join(MODELS, "lstm_weights.pt")
        if os.path.exists(wpath) and os.path.exists(norm_path):
            with open(norm_path) as f:
                norm_stats = json.load(f)
            model = TyreDegradationLSTM(**cfg)
            model.load_state_dict(torch.load(wpath, map_location="cpu"))
            model.eval()
            laps = []
            for i in range(10):
                laps.append({
                    "lap_time_seconds": -0.3 + i * 0.08,
                    "compound": 1,
                    "tyre_age": i,
                    "fuel_load_kg": 80.0 - i,
                    "track_temp_celsius": 35.0,
                    "air_temp_celsius": 25.0,
                    "gap_ahead_seconds": 2.0,
                    "gap_behind_seconds": 3.0,
                    "safety_car_active": 0,
                    "wind_speed": 10.0,
                    "fresh_tyre": 1 if i == 0 else 0,
                })
            num, comp = build_lstm_sequence_from_laps(laps, norm_stats)
            out = model(torch.FloatTensor(num).unsqueeze(0), torch.LongTensor(comp).unsqueeze(0))
            raw = out[0].detach().numpy()
            lt_mean, lt_std = 95.0, 8.0
            pred_s = float(raw[0]) * lt_std + lt_mean
            deg_t = float(raw[1]) * lt_std * 10.0
            deg_t = max(-2.0, min(8.0, deg_t))
            cp = float(__import__("torch").sigmoid(__import__("torch").tensor(raw[2])).item())
            if not (70 <= pred_s <= 130):
                fails.append(f"LSTM pred lap {pred_s} not in 70-130")
            if not (-2.1 <= deg_t <= 8.1):
                fails.append(f"LSTM deg tenths (clipped) {deg_t} not in [-2,8]")
            if not (0 <= cp <= 1):
                fails.append(f"LSTM cliff {cp} not in [0,1]")
            print(f"LSTM smoke: pred_lt={pred_s:.2f}s deg_tenths={deg_t:.3f} cliff={cp:.3f}")
    except Exception as e:
        fails.append(f"LSTM smoke: {e}")

    try:
        import joblib

        xgb_p = os.path.join(MODELS, "xgb_sc_model.pkl")
        if os.path.exists(xgb_p) and os.path.exists(xgb_names_path):
            m = joblib.load(xgb_p)
            with open(xgb_names_path) as f:
                names = json.load(f)
            fb = FeatureBuilder({})
            st = {
                "lap_number": 20,
                "laps_remaining": 30,
                "circuit_id": "sakhir",
                "track_temp_celsius": 38,
                "air_temp_celsius": 28,
                "rainfall": 0,
                "incidents_so_far": 1,
                "mean_tyre_age_field": 18,
                "year": 2024,
                "tyre_age": 15,
                "compound": 1,
                "wind_speed": 12.0,
                "track_temp_delta": -0.5,
            }
            feats = fb.build_xgb_features(st)
            feats["historical_sc_rate"] = 0.15
            X = np.array([[feats.get(n, 0) for n in names]], dtype=np.float32)
            p = float(m.predict_proba(X)[0, 1])
            if not (0 <= p <= 1):
                fails.append(f"XGB p={p}")
            print(f"XGB smoke: sc_probability={p:.4f}")
    except Exception as e:
        fails.append(f"XGB smoke: {e}")

    if fails:
        print("FAIL:")
        for f in fails:
            print(" ", f)
        return 1
    print("PASS — feature consistency OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
