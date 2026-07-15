"""REQ-5.3/5.4: confidence-threshold and class-allow-list filtering,
applied identically regardless of which `DetectorAdapterLike` produced
the raw detections — the safety boundary lives in this one shared
stage, not inside any individual adapter implementation (see
docs/adr/ADR-006-detection-model-and-tracker.md's "Alternative D").
"""

from __future__ import annotations

from vision_service.frames.models import Detection


def filter_detections(
    detections: list[Detection],
    confidence_threshold: float,
    allowed_classes: frozenset[str],
) -> list[Detection]:
    """Drops any detection below `confidence_threshold` or whose
    `label` is not in `allowed_classes`. Order is preserved; nothing
    else about a retained detection is modified. Does not mutate
    `detections`.
    """
    return [
        detection
        for detection in detections
        if detection.confidence >= confidence_threshold and detection.label in allowed_classes
    ]
