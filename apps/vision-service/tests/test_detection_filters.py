"""REQ-5.3/5.4/5.11: confidence-threshold and class-allow-list filtering."""

from __future__ import annotations

from vision_service.detection.filters import filter_detections
from vision_service.frames.models import BoundingBox, Detection


def _detection(label: str, confidence: float) -> Detection:
    return Detection(
        label=label,
        confidence=confidence,
        boundingBox=BoundingBox(x=0, y=0, width=10, height=10),
    )


def test_drops_detections_below_the_confidence_threshold() -> None:
    detections = [_detection("person", 0.2), _detection("person", 0.6)]

    result = filter_detections(detections, confidence_threshold=0.35, allowed_classes={"person"})

    assert len(result) == 1
    assert result[0].confidence == 0.6


def test_keeps_a_detection_exactly_at_the_threshold() -> None:
    detections = [_detection("person", 0.35)]

    result = filter_detections(detections, confidence_threshold=0.35, allowed_classes={"person"})

    assert len(result) == 1


def test_drops_detections_outside_the_class_allow_list() -> None:
    """REQ-5.4: the safety-critical case — a class the model is
    perfectly confident about is still dropped if it isn't
    allow-listed. `dog` is a real COCO class, chosen here specifically
    because it is NOT in `detection.classes.ALLOWED_CLASSES`.
    """
    detections = [_detection("dog", 0.99), _detection("person", 0.99)]

    result = filter_detections(detections, confidence_threshold=0.1, allowed_classes={"person"})

    assert [detection.label for detection in result] == ["person"]


def test_preserves_order_of_retained_detections() -> None:
    detections = [_detection("car", 0.9), _detection("dog", 0.9), _detection("person", 0.9)]

    result = filter_detections(
        detections, confidence_threshold=0.1, allowed_classes={"car", "person"}
    )

    assert [detection.label for detection in result] == ["car", "person"]


def test_does_not_mutate_the_input_list() -> None:
    detections = [_detection("person", 0.9)]
    original_length = len(detections)

    filter_detections(detections, confidence_threshold=0.99, allowed_classes={"person"})

    assert len(detections) == original_length


def test_empty_input_returns_empty_output() -> None:
    assert filter_detections([], confidence_threshold=0.1, allowed_classes={"person"}) == []
