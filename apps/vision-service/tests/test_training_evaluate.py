"""REQ-8.8/8.13/8.14: threshold-based checks against synthetic fixtures —
no real model output, per Coding_Standards.md's "model behavior:
evaluation fixtures and threshold-based checks".
"""

from __future__ import annotations

from vision_service.frames.models import BoundingBox, Detection
from vision_service.training.evaluate import compute_iou, evaluate


def _det(
    label: str, x: float, y: float, w: float, h: float, confidence: float = 0.9
) -> Detection:
    return Detection(
        label=label, confidence=confidence, boundingBox=BoundingBox(x=x, y=y, width=w, height=h)
    )


def test_compute_iou_identical_boxes_is_one() -> None:
    box = BoundingBox(x=0, y=0, width=10, height=10)
    assert compute_iou(box, box) == 1.0


def test_compute_iou_disjoint_boxes_is_zero() -> None:
    a = BoundingBox(x=0, y=0, width=10, height=10)
    b = BoundingBox(x=100, y=100, width=10, height=10)
    assert compute_iou(a, b) == 0.0


def test_compute_iou_partial_overlap_between_zero_and_one() -> None:
    a = BoundingBox(x=0, y=0, width=10, height=10)
    b = BoundingBox(x=5, y=5, width=10, height=10)
    iou = compute_iou(a, b)
    assert 0.0 < iou < 1.0


def test_perfect_predictions_score_full_marks() -> None:
    ground_truth = {"f1.jpg": [_det("car", 10, 10, 50, 50)]}
    predictions = {"f1.jpg": [_det("car", 10, 10, 50, 50, confidence=0.95)]}

    report = evaluate(predictions, ground_truth)

    assert report["meanAveragePrecision"] == 1.0
    car_metric = next(c for c in report["perClass"] if c["label"] == "car")
    assert car_metric["precision"] == 1.0
    assert car_metric["recall"] == 1.0
    assert car_metric["averagePrecision"] == 1.0
    assert report["flaggedClasses"] == []


def test_missed_class_is_flagged_relative_to_a_strong_class() -> None:
    ground_truth = {
        "f1.jpg": [_det("car", 10, 10, 50, 50), _det("person", 200, 200, 20, 40)],
    }
    # "car" detected perfectly; "person" never predicted at all.
    predictions = {"f1.jpg": [_det("car", 10, 10, 50, 50, confidence=0.95)]}

    report = evaluate(predictions, ground_truth)

    person_metric = next(c for c in report["perClass"] if c["label"] == "person")
    assert person_metric["averagePrecision"] == 0.0
    assert person_metric["supportCount"] == 1
    assert "person" in report["flaggedClasses"]
    assert "car" not in report["flaggedClasses"]


def test_false_positive_reduces_precision() -> None:
    ground_truth = {"f1.jpg": [_det("car", 10, 10, 50, 50)]}
    predictions = {
        "f1.jpg": [
            _det("car", 10, 10, 50, 50, confidence=0.95),
            _det("car", 300, 300, 20, 20, confidence=0.5),  # spurious extra box
        ]
    }

    report = evaluate(predictions, ground_truth)
    car_metric = next(c for c in report["perClass"] if c["label"] == "car")
    assert car_metric["precision"] < 1.0
    assert car_metric["recall"] == 1.0


def test_failure_notes_pass_through_verbatim() -> None:
    ground_truth = {"f1.jpg": [_det("car", 10, 10, 50, 50)]}
    predictions = {"f1.jpg": [_det("car", 10, 10, 50, 50)]}
    notes = ["Systematic false negatives on boats under 20% frame coverage."]

    report = evaluate(predictions, ground_truth, failure_notes=notes)

    assert report["failureNotes"] == notes


def test_empty_ground_truth_yields_zero_map_and_empty_per_class() -> None:
    report = evaluate({}, {})
    assert report["meanAveragePrecision"] == 0.0
    assert report["perClass"] == []
    assert report["flaggedClasses"] == []
    assert report["failureNotes"] == []
