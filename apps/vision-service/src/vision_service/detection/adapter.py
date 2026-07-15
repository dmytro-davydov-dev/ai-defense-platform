"""REQ-5.1: the detector adapter interface. `commands_consumer.py`'s
pipeline depends only on `DetectorAdapterLike`, never on
`OnnxDetectorAdapter`'s ONNX Runtime specifics directly — swapping the
underlying model (a different YOLO variant, a future Phase 8 model
registry pick) is a call-site change, not a pipeline change, per the
Technology Independence guiding principle.

Confidence thresholding (REQ-5.3) and class-allow-list filtering
(REQ-5.4) are deliberately NOT this interface's responsibility — see
`detection/filters.py`'s docstring and
docs/adr/ADR-006-detection-model-and-tracker.md's "Alternative D".
"""

from __future__ import annotations

from typing import Protocol

import numpy as np

from vision_service.frames.models import Detection


class DetectorAdapterLike(Protocol):
    def detect(self, frame: np.ndarray) -> list[Detection]:
        """Returns raw, unfiltered, untracked detections for one
        `HxWxC uint8` BGR frame (OpenCV's native decode order, the
        same convention `video.reader.VideoReader.frames()` yields).
        Implementations may raise on an unrecoverable failure (e.g. a
        model load or inference error) — the caller's existing
        retry/DLQ machinery (REQ-3.9/3.10) handles that, the same way
        it already handles `video.reader.VideoOpenError`.
        """
        ...


class NullDetectorAdapter:
    """Always returns zero detections. Two uses: (1) the production
    default when `VISION_SERVICE_DETECTION_MODEL_PATH` isn't
    configured — `detection/factory.py`'s "disabled, not broken"
    fallback, mirroring how blank `KAFKA_BROKERS`/`MINIO_ROOT_USER`
    already disable (not crash) their respective subsystems; (2) a
    ready-made fake for tests that only care about the pipeline
    running end-to-end (e.g. the failure/DLQ path), without needing to
    hand-construct a scripted detector.
    """

    def detect(self, frame: np.ndarray) -> list[Detection]:
        return []
