"""Tests for the safety hardening: debug gate and rate limiting."""

import backend.main as main


class TestDebugGate:
    def test_debug_endpoint_hidden_by_default(self, client, monkeypatch):
        monkeypatch.delenv("DEBUG_ENDPOINTS", raising=False)
        assert client.get("/debug/model_versions").status_code == 404

    def test_debug_endpoint_available_when_enabled(self, client, monkeypatch):
        monkeypatch.setenv("DEBUG_ENDPOINTS", "1")
        assert client.get("/debug/model_versions").status_code == 200


class TestRateLimit:
    def test_limit_returns_429(self, client, monkeypatch):
        monkeypatch.setattr(main, "RATE_LIMIT_PER_MINUTE", 3)
        main._rate_buckets.clear()
        try:
            statuses = [client.get("/races").status_code for _ in range(5)]
            assert statuses[:3] == [200, 200, 200]
            assert 429 in statuses[3:]
        finally:
            main._rate_buckets.clear()

    def test_health_exempt_from_limit(self, client, monkeypatch):
        monkeypatch.setattr(main, "RATE_LIMIT_PER_MINUTE", 1)
        main._rate_buckets.clear()
        try:
            statuses = [client.get("/health").status_code for _ in range(5)]
            assert statuses == [200] * 5
        finally:
            main._rate_buckets.clear()
