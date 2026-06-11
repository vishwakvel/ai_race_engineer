"""Shared fixtures: a session-scoped TestClient with real models loaded."""

import os

# Force the radio generator into template-fallback mode BEFORE backend.main
# is imported, so tests never hit the live Anthropic API.
os.environ["ANTHROPIC_API_KEY"] = ""

import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture(scope="session")
def client():
    # Context manager runs the lifespan (model + parquet loading) once.
    with TestClient(app) as c:
        yield c
