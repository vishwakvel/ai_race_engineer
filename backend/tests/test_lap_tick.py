"""Tests for the aggregate POST /race/lap_tick endpoint."""

import math


BODY = {
    "next_lap": {
        "stint_laps": [],
        "current_state": {
            "compound": 1,
            "tyre_age": 8,
            "fuel_load_kg": 85.0,
            "circuit_id": "monaco",
            "lap_number": 15,
            "laps_remaining": 63,
        },
    },
    "safety_car": {
        "lap_number": 15,
        "laps_remaining": 63,
        "circuit": "monaco",
    },
    "strategy": {
        "state": {
            "lap_number": 15,
            "laps_remaining": 63,
            "position": 3,
            "compound": 1,
            "tyre_age": 8,
            "fuel_load_kg": 85.0,
            "gap_ahead_seconds": 3.0,
            "gap_behind_seconds": 2.0,
            "circuit_id": "monaco",
        },
        "run_monte_carlo": True,
        "n_simulations": 25,
    },
    "engineer_context": {
        "circuit_name": "MONACO",
        "lap_number": 15,
        "total_laps": 78,
        "position": 3,
        "compound": "MEDIUM",
        "tyre_age": 8,
        "is_actual_pit_lap": False,
    },
    "recent_message_types": [],
}


class TestLapTick:
    def test_returns_all_four_sections(self, client):
        r = client.post("/race/lap_tick", json=BODY)
        assert r.status_code == 200
        body = r.json()
        for key in ("next_lap", "safety_car", "strategy", "engineer"):
            assert key in body

    def test_sections_match_individual_endpoint_shapes(self, client):
        body = client.post("/race/lap_tick", json=BODY).json()

        nl = body["next_lap"]
        assert math.isfinite(nl["predicted_lap_time"])
        assert 0.0 <= nl["cliff_probability"] <= 1.0

        sc = body["safety_car"]
        assert 0.0 <= sc["sc_probability"] <= 1.0
        assert isinstance(sc["top_shap_factors"], list)

        st = body["strategy"]
        assert isinstance(st["recommended_action"], str)
        assert 0.0 <= st["action_confidence"] <= 1.0

        eng = body["engineer"]
        assert isinstance(eng["message"], str) and eng["message"]
        assert eng["lap_number"] == 15

    def test_client_recommended_action_override_respected(self, client):
        override = dict(BODY)
        override["engineer_context"] = {
            **BODY["engineer_context"],
            "recommended_action": "PIT_HARD",
            "is_actual_pit_lap": True,
        }
        r = client.post("/race/lap_tick", json=override)
        assert r.status_code == 200

    def test_n_simulations_bounds_enforced(self, client):
        bad = dict(BODY)
        bad["strategy"] = {**BODY["strategy"], "n_simulations": 99999}
        assert client.post("/race/lap_tick", json=bad).status_code == 422
