"""Module-level singleton for the active detector adapter — same
pattern as `storage.minio_client`'s `minio_client`: constructed once at
import time so `kafka.runner` (and any future health check) share one
instance.

`VISION_SERVICE_DETECTION_MODEL_PATH` unset -> `NullDetectorAdapter`
(REQ-5.2's "disabled, not broken" treatment, matching how blank
`KAFKA_BROKERS`/`MINIO_ROOT_USER` already disable rather than crash
their subsystems). See
docs/adr/ADR-006-detection-model-and-tracker.md.
"""

from __future__ import annotations

from vision_service.detection.adapter import DetectorAdapterLike, NullDetectorAdapter
from vision_service.detection.onnx_detector import OnnxDetectorAdapter
from vision_service.observability import log
from vision_service.settings import settings


def build_detector() -> DetectorAdapterLike:
    if not settings.detection_model_path:
        log(
            "warn",
            "VISION_SERVICE_DETECTION_MODEL_PATH not set — detection disabled, "
            "NullDetectorAdapter will publish zero detections per mission",
        )
        return NullDetectorAdapter()
    return OnnxDetectorAdapter(settings.detection_model_path)


detector = build_detector()
