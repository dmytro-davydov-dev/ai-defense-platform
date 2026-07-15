"""REQ-8.7/8.9/8.10: `registry_client` against an `httpx.MockTransport`
fake — no real `apps/api` process, no network, mirroring
`test_detection_onnx_detector.py`'s fake-session technique.
"""

from __future__ import annotations

import httpx
import pytest

from vision_service.training import registry_client
from vision_service.training.registry_client import RegistryNotConfiguredError


def _client(handler) -> httpx.Client:
    transport = httpx.MockTransport(handler)
    return httpx.Client(base_url="http://api.test", transport=transport)


def test_report_training_run_posts_payload_and_returns_json() -> None:
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["body"] = request.content
        return httpx.Response(201, json={"id": "run-1", "status": "COMPLETED"})

    result = registry_client.report_training_run(
        {"datasetId": "d1", "status": "COMPLETED"}, client=_client(handler)
    )

    assert result == {"id": "run-1", "status": "COMPLETED"}
    assert captured["url"] == "http://api.test/training-runs"


def test_register_model_posts_to_models_endpoint() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == "http://api.test/models"
        return httpx.Response(201, json={"id": "model-1", "stage": "CANDIDATE"})

    result = registry_client.register_model(
        {"trainingRunId": "run-1", "objectKey": "model-1/model.onnx"},
        client=_client(handler),
    )
    assert result["stage"] == "CANDIDATE"


def test_get_production_model_returns_none_on_404() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(404)

    result = registry_client.get_production_model(client=_client(handler))
    assert result is None


def test_get_production_model_returns_json_on_success() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"id": "model-1", "objectKey": "model-1/model.onnx"})

    result = registry_client.get_production_model(client=_client(handler))
    assert result == {"id": "model-1", "objectKey": "model-1/model.onnx"}


def test_report_training_run_raises_on_server_error() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"message": "boom"})

    with pytest.raises(httpx.HTTPStatusError):
        registry_client.report_training_run({}, client=_client(handler))


def test_functions_raise_registry_not_configured_when_base_url_unset(monkeypatch) -> None:
    monkeypatch.setattr(registry_client.settings, "model_registry_base_url", "")
    with pytest.raises(RegistryNotConfiguredError):
        registry_client.report_training_run({})
