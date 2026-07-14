"""REQ-4.7/4.12: `/ready` reflects real Kafka/MinIO connectivity, and
`CommandsConsumerRunner.is_ready`'s own tri-state logic (unconfigured /
configured-and-connected / configured-and-not-connected) in isolation.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from vision_service.kafka.runner import CommandsConsumerRunner
from vision_service.main import app
from vision_service.settings import settings
from vision_service.storage import minio_client as minio_client_module

client = TestClient(app)


def test_runner_is_ready_when_never_configured() -> None:
    runner = CommandsConsumerRunner()
    assert runner.is_ready is True


def test_runner_is_not_ready_before_start_completes_once_configured() -> None:
    runner = CommandsConsumerRunner()
    runner._kafka_configured = True  # noqa: SLF001 - simulating mid-startup state
    assert runner.is_ready is False


def test_runner_is_ready_once_started_and_not_ready_after_stop() -> None:
    runner = CommandsConsumerRunner()
    runner._kafka_configured = True  # noqa: SLF001
    runner._kafka_ready = True  # noqa: SLF001
    assert runner.is_ready is True

    runner._kafka_ready = False  # noqa: SLF001 - what stop() sets
    assert runner.is_ready is False


def test_ready_reports_not_ready_when_minio_configured_but_unreachable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "minio_root_user", "test-user")
    monkeypatch.setattr(settings, "minio_root_password", "test-password")
    monkeypatch.setattr(minio_client_module.minio_client, "is_reachable", lambda: False)

    response = client.get("/ready")

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "not_ready"
    assert body["minio"] == "not_ready"


def test_ready_reports_ready_when_minio_configured_and_reachable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "minio_root_user", "test-user")
    monkeypatch.setattr(settings, "minio_root_password", "test-password")
    monkeypatch.setattr(minio_client_module.minio_client, "is_reachable", lambda: True)

    response = client.get("/ready")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["minio"] == "ready"
