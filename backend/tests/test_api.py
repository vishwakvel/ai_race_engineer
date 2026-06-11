"""API contract tests for every public endpoint."""

import math


def _finite(x) -> bool:
    return isinstance(x, (int, float)) and math.isfinite(x)


class TestHealth:
    def test_health_ok(self, client):
        r = client.get("/health")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "ok"
        assert "models_loaded" in body
        assert "data_rows" in body


class TestRaces:
    def test_races_list(self, client):
        r = client.get("/races")
        assert r.status_code == 200
        races = r.json()
        assert isinstance(races, list)
        if races:
            first = races[0]
            for key in ("year", "round", "circuit_id", "circuit_name", "total_laps"):
                assert key in first

    def test_races_is_stable_across_calls(self, client):
        assert client.get("/races").json() == client.get("/races").json()


class TestRaceLaps:
    def test_laps_for_first_known_race(self, client):
        races = client.get("/races").json()
        if not races:
            return  # no parquet in this environment — nothing to assert
        race = races[0]
        r = client.get(f"/race/{race['year']}/{race['round']}/laps")
        assert r.status_code == 200
        laps = r.json()
        assert len(laps) > 0
        lap = laps[0]
        for key in ("lap_number", "lap_time_seconds", "compound_str", "position"):
            assert key in lap
        assert _finite(lap["lap_time_seconds"])

    def test_unknown_race_returns_empty(self, client):
        r = client.get("/race/1999/99/laps")
        assert r.status_code == 200
        assert r.json() == []


class TestTrackMap:
    def test_known_circuit(self, client):
        r = client.get("/circuit/track_map/monaco")
        assert r.status_code == 200
        body = r.json()
        assert body["circuit_id"] == "monaco"

    def test_alias_resolution(self, client):
        # monte_carlo aliases to monaco
        r = client.get("/circuit/track_map/monte_carlo")
        assert r.status_code == 200
        assert r.json()["circuit_id"] == "monaco"

    def test_unknown_circuit_404(self, client):
        r = client.get("/circuit/track_map/atlantis_xyz")
        assert r.status_code == 404


class TestPredictNextLap:
    def test_minimal_request(self, client):
        r = client.post(
            "/predict/next_lap",
            json={
                "stint_laps": [],
                "current_state": {
                    "compound": 1,
                    "tyre_age": 5,
                    "fuel_load_kg": 90.0,
                    "circuit_id": "monaco",
                    "lap_number": 10,
                    "laps_remaining": 40,
                },
            },
        )
        assert r.status_code == 200
        body = r.json()
        assert _finite(body["predicted_lap_time"])
        assert _finite(body["deg_rate"])
        assert 0.0 <= body["cliff_probability"] <= 1.0


class TestPredictSafetyCar:
    def test_probability_bounds(self, client):
        r = client.post(
            "/predict/safety_car",
            json={
                "lap_number": 12,
                "laps_remaining": 40,
                "circuit": "monaco",
            },
        )
        assert r.status_code == 200
        body = r.json()
        assert 0.0 <= body["sc_probability"] <= 1.0
        assert isinstance(body["top_shap_factors"], list)


class TestStrategyRecommend:
    BASE_STATE = {
        "lap_number": 20,
        "laps_remaining": 30,
        "position": 4,
        "compound": 1,
        "tyre_age": 12,
        "fuel_load_kg": 70.0,
        "gap_ahead_seconds": 2.5,
        "gap_behind_seconds": 1.8,
        "sc_probability": 0.1,
        "cliff_probability": 0.05,
        "circuit_id": "monaco",
    }

    def test_recommend_without_monte_carlo(self, client):
        r = client.post(
            "/strategy/recommend",
            json={"state": self.BASE_STATE, "run_monte_carlo": False},
        )
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body["recommended_action"], str)
        assert 0.0 <= body["action_confidence"] <= 1.0

    def test_recommend_with_monte_carlo(self, client):
        r = client.post(
            "/strategy/recommend",
            json={
                "state": self.BASE_STATE,
                "run_monte_carlo": True,
                "n_simulations": 25,
            },
        )
        assert r.status_code == 200
        body = r.json()
        assert body["median_finish"] >= 0

    def test_n_simulations_upper_bound_rejected(self, client):
        r = client.post(
            "/strategy/recommend",
            json={
                "state": self.BASE_STATE,
                "run_monte_carlo": True,
                "n_simulations": 100000,
            },
        )
        assert r.status_code == 422

    def test_n_simulations_zero_rejected(self, client):
        r = client.post(
            "/strategy/recommend",
            json={"state": self.BASE_STATE, "n_simulations": 0},
        )
        assert r.status_code == 422


class TestEngineerMessage:
    def test_fallback_message_without_api_key(self, client):
        r = client.post(
            "/engineer/message",
            json={
                "context": {"lap_number": 5, "circuit_name": "MONACO"},
                "recent_message_types": [],
            },
        )
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body["message"], str) and body["message"]
        assert body["lap_number"] == 5


class TestPreraceStrategy:
    def test_prerace_brief(self, client):
        r = client.get(
            "/engineer/prerace_strategy",
            params={"circuit": "monaco", "year": 2024, "total_laps": 78},
        )
        assert r.status_code == 200
        body = r.json()
        assert "recommended" in body
        assert isinstance(body["recommended"]["compounds"], list)
