"""XGBoost model for safety car probability prediction."""

import os
import json
import numpy as np
import joblib

SHAP_FEATURE_LABELS = {
    "lap_number": "Lap clustering",
    "laps_remaining": "Laps remaining",
    "circuit_encoded": "Circuit history",
    "track_temp": "Track temp",
    "air_temp": "Air temp",
    "rainfall": "Wet conditions",
    "incidents_so_far": "Race incidents",
    "cars_within_2s": "Close battle",
    "mean_tyre_age_field": "Old tyre field",
    "year": "Season",
    "lap_fraction": "Race phase",
    "historical_sc_rate": "Historical SC rate",
    "field_tyre_stress_index": "Field tyre stress",
    "wind_speed": "Wind speed",
    "track_temp_delta": "Track temp change",
}


class XGBModel:
    def __init__(self, models_dir: str) -> None:
        self.models_dir = models_dir
        self.model = None
        self.lr_model = None
        self.feature_names = None
        self.circuit_encoding = None
        self.vsc_ratios: dict = {}
        self.battle_intensity: dict = {}
        self.loaded = False

    def load(self) -> None:
        path = os.path.join(self.models_dir, "xgb_sc_model.pkl")
        fn_path = os.path.join(self.models_dir, "xgb_feature_names.json")
        if not os.path.exists(path) or not os.path.exists(fn_path):
            print("[XGBModel] WARNING: Model files not found. Using fallback.")
            return
        self.model = joblib.load(path)
        lr_path = os.path.join(self.models_dir, "lr_sc_model.pkl")
        self.lr_model = joblib.load(lr_path) if os.path.exists(lr_path) else None
        with open(fn_path) as f:
            self.feature_names = json.load(f)
        enc_path = os.path.join(self.models_dir, "xgb_circuit_encoding.json")
        if os.path.exists(enc_path):
            with open(enc_path) as f:
                self.circuit_encoding = json.load(f)
        vr = os.path.join(self.models_dir, "circuit_vsc_ratio.json")
        if os.path.exists(vr):
            with open(vr) as f:
                self.vsc_ratios = json.load(f)
        bi = os.path.join(self.models_dir, "circuit_battle_intensity.json")
        if os.path.exists(bi):
            with open(bi) as f:
                self.battle_intensity = json.load(f)
        self.loaded = True
        print("[XGBModel] Loaded successfully.")

    def predict(self, state: dict) -> dict:
        circuit_id = str(state.get("circuit_id", "") or "").lower()
        vsc_ratio = float(self.vsc_ratios.get(circuit_id, self.vsc_ratios.get(state.get("circuit_id", ""), 0.35)))
        if not self.loaded or self.feature_names is None:
            return {"sc_probability": 0.05, "top_shap_factors": [], "vsc_ratio": vsc_ratio}
        from backend.features.feature_builder import FeatureBuilder

        fb = FeatureBuilder({})
        feats = fb.build_xgb_features(state)
        if self.battle_intensity and "cars_within_2s" not in state:
            feats["cars_within_2s"] = float(
                self.battle_intensity.get(circuit_id, self.battle_intensity.get("_default", 2.2))
            )
        feats["historical_sc_rate"] = state.get("historical_sc_rate", 0.15)
        X = np.array([[feats.get(n, 0) for n in self.feature_names]], dtype=np.float32)
        p_xgb = float(self.model.predict_proba(X)[0, 1])
        if self.lr_model is not None:
            p_lr = float(self.lr_model.predict_proba(X)[0, 1])
            sc_probability = float(0.7 * p_xgb + 0.3 * p_lr)
        else:
            sc_probability = p_xgb
        top_shap_factors = []
        try:
            import shap

            base_estimator = (
                self.model.calibrated_classifiers_[0].estimator
                if hasattr(self.model, "calibrated_classifiers_")
                else self.model
            )
            explainer = shap.TreeExplainer(base_estimator)
            shap_vals = explainer.shap_values(X)
            if isinstance(shap_vals, list):
                shap_vals = shap_vals[1] if len(shap_vals) > 1 else shap_vals[0]
            if shap_vals is not None and len(shap_vals) > 0:
                vals = shap_vals[0]
                order = np.argsort(np.abs(vals))[::-1][:3]
                for i in order:
                    if i < len(self.feature_names):
                        name = self.feature_names[i]
                        label = SHAP_FEATURE_LABELS.get(name, name)
                        top_shap_factors.append({"feature": label, "impact": float(vals[i])})
        except Exception:
            pass
        return {
            "sc_probability": sc_probability,
            "top_shap_factors": top_shap_factors,
            "vsc_ratio": vsc_ratio,
        }
