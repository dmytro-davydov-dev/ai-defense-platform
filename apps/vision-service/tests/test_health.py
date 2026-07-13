"""Trivial smoke tests for the Phase 1 shell (REQ-1.14: pytest runnable,
zero-to-a-few trivial tests passing)."""

from fastapi.testclient import TestClient

from vision_service.main import app

client = TestClient(app)


def test_health_returns_ok() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_ready_returns_ready() -> None:
    response = client.get("/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


def test_version_returns_service_metadata() -> None:
    response = client.get("/version")
    assert response.status_code == 200
    body = response.json()
    assert body["service"] == "vision-service"
    assert "version" in body
