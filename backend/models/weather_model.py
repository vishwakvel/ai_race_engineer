"""Weather impact on lap time and SC risk."""

import os
import json
import numpy as np
import joblib


class WeatherModel:
    def __init__(self, models_dir: str) -> None:
        self.models_dir = models_dir
        self.lap_bundle = None
        self.sc_bundle = None
        self.loaded = False

    def load(self) -> None:
        lp = os.path.join(self.models_dir, "weather_lap_model.pkl")
        sp = os.path.join(self.models_dir, "weather_sc_model.pkl")
        if os.path.exists(lp):
            self.lap_bundle = joblib.load(lp)
        if os.path.exists(sp):
            self.sc_bundle = joblib.load(sp)
        self.loaded = self.lap_bundle is not None and self.sc_bundle is not None
        if self.loaded:
            print("[WeatherModel] Loaded.")
        else:
            print("[WeatherModel] Optional models not found; predictions default.")

    def predict(self, state: dict) -> dict:
        from backend.features.feature_builder import CIRCUIT_ENCODING

        track_temp = float(state.get("track_temp_celsius", state.get("track_temp", 35.0)))
        air_temp = float(state.get("air_temp_celsius", state.get("air_temp", 25.0)))
        rainfall = int(state.get("rainfall", 0) or 0)
        wind_speed = float(state.get("wind_speed", 0.0) or 0.0)
        track_temp_delta = float(state.get("track_temp_delta", 0.0) or 0.0)
        lap_number = float(state.get("lap_number", 1))
        total_laps = float(state.get("total_laps", lap_number + state.get("laps_remaining", 50)))
        lap_fraction = lap_number / max(total_laps, 1.0)
        cid = str(state.get("circuit_id", "") or "").lower()
        circuit_encoded = float(CIRCUIT_ENCODING.get(cid, 0))

        temp_delta = track_temp - air_temp
        is_cool = int(track_temp < 25.0)
        is_hot = int(track_temp > 45.0)

        weather_lap_delta = float(rainfall) * 9.0 + abs(min(0.0, track_temp_delta)) * 0.6
        if self.lap_bundle and self.lap_bundle.get("model"):
            names = self.lap_bundle["feature_names"]
            row = {
                "track_temp": track_temp,
                "air_temp": air_temp,
                "temp_delta": temp_delta,
                "rainfall_binary": rainfall,
                "wind_speed": wind_speed,
                "track_temp_delta": track_temp_delta,
                "is_cool_track": is_cool,
                "is_hot_track": is_hot,
                "circuit_encoded": circuit_encoded,
                "lap_fraction": lap_fraction,
            }
            X = np.array([[row.get(n, 0) for n in names]], dtype=np.float32)
            weather_lap_delta = float(self.lap_bundle["model"].predict(X)[0])

        weather_sc_multiplier = (
            1.0 + float(rainfall) * 1.8 + abs(min(0.0, track_temp_delta)) * 0.2
        )
        weather_sc_multiplier = float(np.clip(weather_sc_multiplier, 0.8, 5.0))
        if self.sc_bundle and self.sc_bundle.get("model"):
            names = self.sc_bundle["feature_names"]
            row2 = {
                "track_temp": track_temp,
                "air_temp": air_temp,
                "rainfall_binary": rainfall,
                "wind_speed": wind_speed,
                "track_temp_delta": track_temp_delta,
                "is_cool_track": is_cool,
                "circuit_encoded": circuit_encoded,
                "lap_fraction": lap_fraction,
            }
            X2 = np.array([[row2.get(n, 0) for n in names]], dtype=np.float32)
            weather_sc_multiplier = float(np.clip(self.sc_bundle["model"].predict(X2)[0], 0.5, 5.0))

        if rainfall == 1 and weather_lap_delta > 8.0:
            condition = "extreme"
        elif rainfall == 1:
            condition = "wet"
        elif track_temp < 22.0 or track_temp_delta < -3.0:
            condition = "damp"
        else:
            condition = "dry"

        if track_temp_delta < -2.0:
            rain_trend = "increasing"
        elif track_temp_delta > 2.0:
            rain_trend = "decreasing"
        else:
            rain_trend = "stable"

        advisory = None
        if rainfall == 1 and weather_lap_delta > 5.0:
            advisory = "Heavy rain. Intermediate tyres needed immediately."
        elif track_temp_delta < -3.5:
            advisory = f"Track temp dropping {abs(track_temp_delta):.1f}°C. Rain may be arriving."
        elif track_temp > 48.0:
            advisory = "Track very hot. Monitor rear tyre blistering."
        elif wind_speed > 40.0:
            advisory = f"Strong winds {wind_speed:.0f}km/h. Expect instability on straights."
        elif rainfall == 0 and rain_trend == "increasing":
            advisory = "Track cooling. Watch for rain."

        return {
            "weather_lap_delta": weather_lap_delta,
            "weather_sc_multiplier": weather_sc_multiplier,
            "weather_condition": condition,
            "weather_advisory": advisory,
            "rain_risk_trend": rain_trend,
        }
