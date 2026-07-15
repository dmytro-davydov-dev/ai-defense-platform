"""PRD-Phase-8 (docs/mvp-plan/PRD-Phase-8.md) REQ-8.7/8.9/8.10: a thin
HTTP client wrapping `apps/api`'s dataset/training-run/model-registry
endpoints — the in-house "experiment tracker"
docs/adr/ADR-008-experiment-tracking-and-dataset-versioning.md decided
to build rather than adopt MLflow.

`client` is injectable on every function (an `httpx.Client`, real or a
`httpx.MockTransport`-backed fake) purely for unit-test isolation — the
same reason `OnnxDetectorAdapter` accepts an injectable `session`
(`detection/onnx_detector.py`). Every function's default constructs a
real client against `settings.model_registry_base_url`.

Authentication: this reference implementation defers full OIDC/service-
identity to Phase 10 (docs/security/Security_Baseline.md); a training
run is a human-operated batch job, so it authenticates with a bearer
token the operator obtains from `apps/api`'s existing login endpoint
and configures via `VISION_SERVICE_MODEL_REGISTRY_API_TOKEN` — not a
new machine-identity mechanism.
"""

from __future__ import annotations

from typing import Any

import httpx

from vision_service.settings import settings


class RegistryClientError(RuntimeError):
    """Base class for every error this module raises."""


class RegistryNotConfiguredError(RegistryClientError):
    """`VISION_SERVICE_MODEL_REGISTRY_BASE_URL` is unset — callers should
    treat the registry as unavailable (skip reporting) rather than crash
    a training run that otherwise completed successfully, mirroring
    `detection.factory`'s "disabled, not broken" treatment of unset
    config elsewhere in this service.
    """


def _base_url() -> str:
    if not settings.model_registry_base_url:
        raise RegistryNotConfiguredError(
            "VISION_SERVICE_MODEL_REGISTRY_BASE_URL is not set — the model registry "
            "is not configured for this environment"
        )
    return settings.model_registry_base_url.rstrip("/")


def _headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if settings.model_registry_api_token:
        headers["Authorization"] = f"Bearer {settings.model_registry_api_token}"
    return headers


def _client(existing: httpx.Client | None, timeout: float = 30.0) -> httpx.Client:
    return existing or httpx.Client(base_url=_base_url(), headers=_headers(), timeout=timeout)


def register_dataset(
    payload: dict[str, Any], *, client: httpx.Client | None = None
) -> dict[str, Any]:
    """REQ-8.1: `POST /datasets`."""
    http = _client(client)
    response = http.post("/datasets", json=payload)
    response.raise_for_status()
    return response.json()


def generate_split(
    dataset_id: str, payload: dict[str, Any], *, client: httpx.Client | None = None
) -> dict[str, Any]:
    """REQ-8.3: `POST /datasets/{dataset_id}/splits`."""
    http = _client(client)
    response = http.post(f"/datasets/{dataset_id}/splits", json=payload)
    response.raise_for_status()
    return response.json()


def report_training_run(
    payload: dict[str, Any], *, client: httpx.Client | None = None
) -> dict[str, Any]:
    """REQ-8.7: `POST /training-runs` — called once, after a run
    completes or fails; see `train.py`'s `run_training_pipeline()`.
    """
    http = _client(client)
    response = http.post("/training-runs", json=payload)
    response.raise_for_status()
    return response.json()


def register_model(
    payload: dict[str, Any], *, client: httpx.Client | None = None
) -> dict[str, Any]:
    """REQ-8.9: `POST /models`, registering an exported `.onnx` artifact
    this process has already uploaded to the models bucket via
    `storage.minio_client`.
    """
    http = _client(client)
    response = http.post("/models", json=payload)
    response.raise_for_status()
    return response.json()


def get_production_model(*, client: httpx.Client | None = None) -> dict[str, Any] | None:
    """REQ-8.10: `GET /models/production` — returns `None` if no model
    has ever been promoted (the endpoint 404s), the same "nothing
    configured yet" signal `detection.factory` already treats as
    "fall back to `NullDetectorAdapter`," not an error.
    """
    http = _client(client, timeout=10.0)
    response = http.get("/models/production")
    if response.status_code == 404:
        return None
    response.raise_for_status()
    return response.json()
