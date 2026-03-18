"""
Deterministic (given seed) lap-by-lap race simulator.
Uses LSTM for lap times, XGBoost for SC events, PPO or fixed strategy.
"""

import os
import json
import copy
import numpy as np
import torch


def _load_json(path: str, default: dict) -> dict:
    if os.path.exists(path):
        try:
            with open(path) as f:
                return json.load(f)
        except Exception:
            pass
    return default


def _simulate_lap_time_impl(
    lstm_model,
    feature_builder,
    norm_stats,
    stint_lap_history,
    circuit_lt_mean=91.5,
    circuit_lt_std=5.0,
    session_mean=92.0,
    rng=None,
):
    rng = rng or np.random.default_rng()
    if lstm_model is not None and feature_builder is not None and norm_stats is not None:
        from backend.features.feature_builder import stint_laps_circuit_lap_time_zscore
        from backend.training.train_lstm import build_lstm_sequence_from_laps

        c_m = float(circuit_lt_mean)
        c_s = max(float(circuit_lt_std), 1e-8)
        z_hist = stint_laps_circuit_lap_time_zscore(stint_lap_history, c_m, c_s)
        numeric_seq, compound_seq = build_lstm_sequence_from_laps(z_hist, norm_stats)
        num_t = torch.FloatTensor(numeric_seq).unsqueeze(0)
        comp_t = torch.LongTensor(compound_seq).unsqueeze(0)
        with torch.no_grad():
            out = lstm_model(num_t, comp_t)
        raw = out[0].numpy()
        pred_lt = float(raw[0]) * c_s + c_m
        raw_deg = float(raw[1])
        deg_rate_tenths = raw_deg * c_s * 10.0
        deg_rate_tenths = max(-2.0, min(8.0, deg_rate_tenths))
        cliff_prob = float(torch.sigmoid(torch.tensor(raw[2])))
        return pred_lt, deg_rate_tenths, cliff_prob
    pred_lt = session_mean + rng.normal(0, 0.5)
    return pred_lt, 0.15, 0.05


def _predict_sc_impl(xgb_model, feature_builder, state, models_dir, rng=None):
    if xgb_model is None or feature_builder is None:
        return 0.05
    feats = feature_builder.build_xgb_features(state)
    feats["historical_sc_rate"] = state.get("historical_sc_rate", 0.15)
    fn_path = os.path.join(models_dir, "xgb_feature_names.json")
    if not os.path.exists(fn_path):
        return 0.05
    with open(fn_path) as f:
        names = json.load(f)
    X = np.array([[feats.get(n, 0) for n in names]], dtype=np.float32)
    proba = xgb_model.predict_proba(X)[0, 1]
    return float(proba)


def _get_sc_reason(state: dict) -> str:
    if state.get("rainfall", 0):
        return "wet track incident"
    ga = state.get("gap_ahead_seconds", 5.0)
    gb = state.get("gap_behind_seconds", 5.0)
    if ga < 1.5 or gb < 1.5:
        return "multi-car battle"
    return "incident ahead"


def _update_competitors_impl(competitors, lec_cumulative, rng, sc_active: bool):
    times = [lec_cumulative]
    optimal_windows = {0: (18, 26), 1: (28, 38), 2: (38, 50)}
    for c in competitors:
        if "target_pit_lap" not in c:
            tc = int(c.get("tyre_compound", 1))
            lo, hi = optimal_windows.get(tc, (25, 35))
            c["target_pit_lap"] = int(rng.integers(lo, hi + 1))
        lap_t = c["mean_lap_time"] + rng.normal(0, 0.4) + c.get("tyre_age", 0) * 0.02
        c["cumulative_time"] = c.get("cumulative_time", 0.0) + lap_t
        c["tyre_age"] = c.get("tyre_age", 0) + 1
        ln = c.get("lap_number", 0) + 1
        c["lap_number"] = ln
        if ln == c.get("target_pit_lap"):
            c["tyre_age"] = 0
            c["target_pit_lap"] = ln + int(rng.integers(20, 40))
        times.append(c["cumulative_time"])
    order = np.argsort(times)
    return int(np.where(order == 0)[0][0]) + 1


class RaceSimulator:
    def __init__(self, lstm_model, xgb_model, ppo_model, feature_builder, norm_stats=None, models_dir=""):
        self.lstm = lstm_model
        self.xgb = xgb_model
        self.ppo = ppo_model
        self.fb = feature_builder
        self.norm_stats = norm_stats or {}
        self.models_dir = models_dir or ""
        md = self.models_dir
        self.circuit_pit_loss = _load_json(os.path.join(md, "circuit_pit_loss.json"), {})
        if not self.circuit_pit_loss:
            self.circuit_pit_loss = {}

    def _init_competitors(self, state, rng):
        session_mean = float(state.get("circuit_lt_mean", 92.0))
        competitors = []
        lec_pos = int(state.get("position", 10))
        positions = [i for i in range(1, 21) if i != lec_pos]
        rng.shuffle(positions)
        for pos in positions[:19]:
            offset = rng.normal(0, 1.5)
            tc = int(rng.integers(0, 3))
            competitors.append({
                "position": pos,
                "cumulative_time": 0.0,
                "mean_lap_time": session_mean + offset,
                "tyre_compound": tc,
                "tyre_age": int(rng.integers(0, 25)),
                "lap_number": int(state.get("lap_number", 1)),
            })
        return competitors

    def simulate(self, initial_state: dict, strategy: dict | None = None, seed: int = 42) -> dict:
        rng = np.random.default_rng(seed)
        state = copy.deepcopy(initial_state)
        state.setdefault("cumulative_time_lec", 0.0)
        state.setdefault("stint_lap_history", [])
        state.setdefault("incidents_so_far", 0)
        state.setdefault("historical_sc_rate", 0.15)
        state.setdefault("circuit_lt_mean", 91.5)
        state.setdefault("circuit_lt_std", 5.0)
        state.setdefault("year", 2024)
        state.setdefault("lap_number", 1)
        state.setdefault("laps_remaining", 30)
        state.setdefault("position", 10)
        state.setdefault("compound", 1)
        state.setdefault("tyre_age", 0)
        state.setdefault("fuel_load_kg", 80.0)
        state.setdefault("gap_ahead_seconds", 0.0)
        state.setdefault("gap_behind_seconds", 5.0)
        state.setdefault("stint_number", 1)
        state.setdefault("wind_speed", 0.0)
        state.setdefault("rainfall", 0)
        state.setdefault("track_temp_celsius", 35.0)
        state.setdefault("air_temp_celsius", 25.0)
        state.setdefault("track_temp_delta", 0.0)
        state.setdefault("track_evolution_index", 0.5)
        state.setdefault("soft_available", 1)
        state.setdefault("medium_available", 1)
        state.setdefault("hard_available", 1)

        total_laps = state.get(
            "total_laps",
            state.get("lap_number", 1) + state.get("laps_remaining", 30),
        )
        current_lap = int(state.get("lap_number", 1))
        laps_remaining = int(state.get("laps_remaining", max(0, total_laps - current_lap)))
        state["total_laps"] = total_laps
        state["lap_number"] = current_lap
        state["laps_remaining"] = laps_remaining

        lap_by_lap = []
        positions_by_lap = []
        pits_taken = []
        sc_events = []
        session_mean = float(state.get("circuit_lt_mean", 92.0))
        circuit_id = str(state.get("circuit_id", "") or "").lower()
        pit_time_default = float(self.circuit_pit_loss.get(circuit_id, 25.0))

        competitors = self._init_competitors(state, rng)

        while int(state.get("laps_remaining", 0)) > 0:
            action = 0
            if strategy and strategy.get("pit_laps") and strategy.get("compounds"):
                pit_laps = strategy.get("pit_laps") or []
                compounds = strategy.get("compounds") or []
                if current_lap in pit_laps:
                    idx = pit_laps.index(current_lap)
                    comp = compounds[min(idx, len(compounds) - 1)]
                    action = {0: 0, 1: 1, 2: 2, "SOFT": 1, "MEDIUM": 2, "HARD": 3}.get(comp, comp)
                    if isinstance(action, str):
                        action = 0
            else:
                if self.ppo is not None and self.fb is not None:
                    obs = self.fb.build_rl_observation(state)
                    ppo_result = self.ppo.predict(obs, deterministic=True)
                    action = int(ppo_result.get("action", 0))

            pit_time_loss = 0.0
            if action > 0:
                compound_map = {1: 0, 2: 1, 3: 2}
                state["compound"] = compound_map.get(action, state.get("compound", 1))
                state["tyre_age"] = 0
                state["stint_lap_history"] = []
                pit_time_loss = float(self.circuit_pit_loss.get(circuit_id, pit_time_default))
                state["stint_number"] = int(state.get("stint_number", 1)) + 1
                pits_taken.append({"lap": current_lap, "compound": state.get("compound", 1)})

            lstm_input = list(state.get("stint_lap_history", [])[-10:])
            pred_lt, deg_rate, cliff_prob = _simulate_lap_time_impl(
                self.lstm,
                self.fb,
                self.norm_stats,
                lstm_input,
                state.get("circuit_lt_mean", 91.5),
                state.get("circuit_lt_std", 5.0),
                session_mean,
                rng,
            )
            current_fuel = max(0.0, float(state.get("fuel_load_kg", 80.0)))
            fuel_penalty = current_fuel * 0.033
            actual_lt = pred_lt + fuel_penalty + rng.normal(0, 0.3)

            tyre_age = int(state.get("tyre_age", 0))
            if cliff_prob > 0 and tyre_age > 15 and rng.random() < cliff_prob:
                actual_lt += rng.uniform(0.8, 2.5)

            sc_prob = _predict_sc_impl(self.xgb, self.fb, state, self.models_dir, rng)
            state["sc_probability"] = sc_prob
            sc_active = rng.random() < sc_prob
            if sc_active:
                actual_lt = pred_lt * 1.4
                state["incidents_so_far"] = state.get("incidents_so_far", 0) + 1
                sc_events.append(current_lap)
                state["gap_ahead_seconds"] = max(0.3, float(state.get("gap_ahead_seconds", 5.0)) * 0.7)
                state["gap_behind_seconds"] = max(0.3, float(state.get("gap_behind_seconds", 5.0)) * 0.7)

            gap_ahead = float(state.get("gap_ahead_seconds", 99.0))
            drs_zones = int(state.get("drs_zones_count", 1))
            if not sc_active and 0 < gap_ahead <= 1.0 and drs_zones > 0:
                actual_lt -= 0.35

            state["cumulative_time_lec"] = state.get("cumulative_time_lec", 0.0) + actual_lt + pit_time_loss
            new_pos = _update_competitors_impl(
                competitors, state.get("cumulative_time_lec", 0.0), rng, sc_active
            )
            state["position"] = new_pos
            state["lap_number"] = int(state.get("lap_number", 1)) + 1
            state["tyre_age"] = int(state.get("tyre_age", 0)) + 1
            state["fuel_load_kg"] = max(0.0, float(state.get("fuel_load_kg", 80.0)) - 1.6)
            state["laps_remaining"] = int(state.get("laps_remaining", 0)) - 1
            state["cliff_probability"] = cliff_prob

            lap_record = {
                "lap_time_seconds": actual_lt,
                "compound": state.get("compound", 1),
                "tyre_age": state.get("tyre_age", 0),
                "fuel_load_kg": state.get("fuel_load_kg", 80.0),
                "track_temp_celsius": state.get("track_temp_celsius", 35),
                "air_temp_celsius": state.get("air_temp_celsius", 25),
                "gap_ahead_seconds": state.get("gap_ahead_seconds", 0),
                "gap_behind_seconds": state.get("gap_behind_seconds", 0),
                "safety_car_active": int(sc_active),
                "wind_speed": state.get("wind_speed", 0.0),
                "fresh_tyre": 1 if int(state.get("tyre_age", 1)) <= 1 else 0,
            }
            hist = state.get("stint_lap_history", [])
            hist.append(lap_record)
            state["stint_lap_history"] = hist

            lap_by_lap.append({
                "lap": current_lap,
                "lap_time": actual_lt,
                "position": new_pos,
                "tyre_compound": state.get("compound", 1),
                "tyre_age": state.get("tyre_age", 0),
                "gap_ahead": state.get("gap_ahead_seconds", 0),
                "gap_behind": state.get("gap_behind_seconds", 0),
                "sc_active": sc_active,
                "pitted": action > 0,
                "cliff_prob": cliff_prob,
                "deg_rate": deg_rate,
                "sc_reason": _get_sc_reason(state),
            })
            positions_by_lap.append(new_pos)
            current_lap = int(state.get("lap_number", current_lap + 1))

        return {
            "final_position": int(state.get("position", 10)),
            "lap_by_lap": lap_by_lap,
            "total_time_seconds": float(state.get("cumulative_time_lec", 0.0)),
            "positions_by_lap": positions_by_lap,
            "pits_taken": pits_taken,
            "sc_events": sc_events,
        }


def run_simulation(current_state: dict, lstm_model, xgb_model, ppo_policy=None, seed: int | None = None):
    sim = RaceSimulator(lstm_model, xgb_model, ppo_policy, None, None, "")
    return sim.simulate(current_state, strategy=None, seed=seed or 42)
