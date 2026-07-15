"""PRD-Phase-8 REQ-8.10: `detection.factory`'s registry-resolution path,
closing the promotion loop
`docs/adr/ADR-006-detection-model-and-tracker.md`'s original "rollback
is unsetting the env var" note only described in reverse. Every
external dependency (`registry_client`, `MinioClient`) is monkeypatched
— no real HTTP or MinIO calls.
"""

from __future__ import annotations

from vision_service.detection import factory
from vision_service.detection.adapter import NullDetectorAdapter
from vision_service.training.registry_client import RegistryClientError


def test_resolve_production_model_path_none_when_registry_not_configured(monkeypatch) -> None:
    monkeypatch.setattr(factory.settings, "model_registry_base_url", "")
    assert factory._resolve_production_model_path() is None


def test_resolve_production_model_path_none_when_nothing_promoted(monkeypatch) -> None:
    monkeypatch.setattr(factory.settings, "model_registry_base_url", "http://api.test")
    monkeypatch.setattr(factory.registry_client, "get_production_model", lambda: None)
    assert factory._resolve_production_model_path() is None


def test_resolve_production_model_path_downloads_and_returns_local_cache_path(monkeypatch) -> None:
    monkeypatch.setattr(factory.settings, "model_registry_base_url", "http://api.test")
    monkeypatch.setattr(factory.settings, "model_registry_local_cache_path", "/tmp/test-model.onnx")
    monkeypatch.setattr(
        factory.registry_client,
        "get_production_model",
        lambda: {"id": "model-1", "objectKey": "dataset-1/model.onnx"},
    )

    downloaded = {}

    class FakeMinioClient:
        def __init__(self, bucket: str) -> None:
            downloaded["bucket"] = bucket

        def download_to(self, object_key: str, dest_path: str) -> None:
            downloaded["object_key"] = object_key
            downloaded["dest_path"] = dest_path

    monkeypatch.setattr(factory, "MinioClient", FakeMinioClient)

    result = factory._resolve_production_model_path()

    assert result == "/tmp/test-model.onnx"
    assert downloaded["object_key"] == "dataset-1/model.onnx"
    assert downloaded["dest_path"] == "/tmp/test-model.onnx"


def test_resolve_production_model_path_falls_back_on_registry_error(monkeypatch) -> None:
    monkeypatch.setattr(factory.settings, "model_registry_base_url", "http://api.test")

    def raise_error():
        raise RegistryClientError("unreachable")

    monkeypatch.setattr(factory.registry_client, "get_production_model", raise_error)
    assert factory._resolve_production_model_path() is None


def test_resolve_production_model_path_falls_back_on_download_error(monkeypatch) -> None:
    monkeypatch.setattr(factory.settings, "model_registry_base_url", "http://api.test")
    monkeypatch.setattr(
        factory.registry_client,
        "get_production_model",
        lambda: {"objectKey": "dataset-1/model.onnx"},
    )

    class FailingMinioClient:
        def __init__(self, bucket: str) -> None:
            pass

        def download_to(self, object_key: str, dest_path: str) -> None:
            raise RuntimeError("minio unreachable")

    monkeypatch.setattr(factory, "MinioClient", FailingMinioClient)
    assert factory._resolve_production_model_path() is None


def test_build_detector_prefers_explicit_env_var_over_registry(monkeypatch) -> None:
    monkeypatch.setattr(factory.settings, "detection_model_path", "/configured/model.onnx")
    monkeypatch.setattr(factory.settings, "model_registry_base_url", "http://api.test")

    calls = []

    class FakeOnnxDetectorAdapter:
        def __init__(self, model_path: str) -> None:
            calls.append(model_path)

    monkeypatch.setattr(factory, "OnnxDetectorAdapter", FakeOnnxDetectorAdapter)

    detector = factory.build_detector()

    assert calls == ["/configured/model.onnx"]
    assert isinstance(detector, FakeOnnxDetectorAdapter)


def test_build_detector_falls_back_to_null_when_nothing_configured(monkeypatch) -> None:
    monkeypatch.setattr(factory.settings, "detection_model_path", "")
    monkeypatch.setattr(factory.settings, "model_registry_base_url", "")

    detector = factory.build_detector()

    assert isinstance(detector, NullDetectorAdapter)


def test_build_detector_uses_registry_resolved_path_when_env_var_unset(monkeypatch) -> None:
    monkeypatch.setattr(factory.settings, "detection_model_path", "")
    monkeypatch.setattr(
        factory, "_resolve_production_model_path", lambda: "/tmp/resolved-model.onnx"
    )

    calls = []

    class FakeOnnxDetectorAdapter:
        def __init__(self, model_path: str) -> None:
            calls.append(model_path)

    monkeypatch.setattr(factory, "OnnxDetectorAdapter", FakeOnnxDetectorAdapter)

    detector = factory.build_detector()

    assert calls == ["/tmp/resolved-model.onnx"]
    assert isinstance(detector, FakeOnnxDetectorAdapter)
