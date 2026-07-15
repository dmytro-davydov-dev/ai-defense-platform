"""Module-level singleton for the active detector adapter — same
pattern as `storage.minio_client`'s `minio_client`: constructed once at
import time so `kafka.runner` (and any future health check) share one
instance.

`VISION_SERVICE_DETECTION_MODEL_PATH` unset -> `NullDetectorAdapter`
(REQ-5.2's "disabled, not broken" treatment, matching how blank
`KAFKA_BROKERS`/`MINIO_ROOT_USER` already disable rather than crash
their subsystems). See
docs/adr/ADR-006-detection-model-and-tracker.md.

Phase 8 (docs/mvp-plan/PRD-Phase-8.md REQ-8.10) closes the promotion
loop this ADR's "Migration and rollback" section originally described
only in reverse ("rollback is setting the env var back to unset"): if
`detection_model_path` is unset but `model_registry_base_url` *is*
configured, this module asks the model registry which version is
currently in PRODUCTION, downloads it, and uses that — so promoting a
model in `apps/api`'s registry changes what a restarted `vision-service`
loads, with no code change, exactly as REQ-8.10 requires. The explicit
env var always takes precedence when set (a manual override), and any
registry-resolution failure (registry unreachable, nothing ever
promoted) falls back to `NullDetectorAdapter` rather than crashing
startup — the same fail-open posture every other optional dependency in
this service already has.
"""

from __future__ import annotations

from vision_service.detection.adapter import DetectorAdapterLike, NullDetectorAdapter
from vision_service.detection.onnx_detector import OnnxDetectorAdapter
from vision_service.observability import log
from vision_service.settings import settings
from vision_service.storage.minio_client import MinioClient
from vision_service.training import registry_client


def _resolve_production_model_path() -> str | None:
    """REQ-8.10: returns a local path to the current production model
    downloaded from the registry, or `None` if the registry isn't
    configured, has no promoted model yet, or couldn't be reached —
    every failure mode here is treated as "not configured," never a
    startup crash.
    """
    if not settings.model_registry_base_url:
        return None
    try:
        production = registry_client.get_production_model()
    except registry_client.RegistryClientError as error:
        log("warn", f"could not resolve production model from registry: {error}")
        return None
    if production is None:
        log("info", "model registry configured but no model is in production yet")
        return None

    object_key = production.get("objectKey")
    if not object_key:
        log("warn", "model registry's production response had no objectKey")
        return None

    try:
        client = MinioClient(bucket=settings.minio_models_bucket)
        client.download_to(object_key, settings.model_registry_local_cache_path)
    except Exception as error:  # any download failure here must fall back, not crash startup
        log("warn", f"could not download production model {object_key!r}: {error}")
        return None
    return settings.model_registry_local_cache_path


def build_detector() -> DetectorAdapterLike:
    if settings.detection_model_path:
        return OnnxDetectorAdapter(settings.detection_model_path)

    resolved_path = _resolve_production_model_path()
    if resolved_path:
        log("info", f"using registry-resolved production model at {resolved_path}")
        return OnnxDetectorAdapter(resolved_path)

    log(
        "warn",
        "VISION_SERVICE_DETECTION_MODEL_PATH not set and no production model "
        "resolvable from the registry — detection disabled, NullDetectorAdapter "
        "will publish zero detections per mission",
    )
    return NullDetectorAdapter()


detector = build_detector()
