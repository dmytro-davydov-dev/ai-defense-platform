"""REQ-5.5/5.11: the in-house IoU tracker
(docs/adr/ADR-006-detection-model-and-tracker.md).
"""

from __future__ import annotations

from vision_service.detection.tracker import Tracker
from vision_service.frames.models import BoundingBox, Detection


def _detection(label: str, x: float, y: float, width: float = 10, height: float = 10) -> Detection:
    return Detection(
        label=label,
        confidence=0.9,
        boundingBox=BoundingBox(x=x, y=y, width=width, height=height),
    )


def test_first_frame_assigns_a_new_track_id_to_every_detection() -> None:
    tracker = Tracker()

    result = tracker.update([_detection("person", 0, 0), _detection("car", 50, 50)])

    assert all(detection.trackId is not None for detection in result)
    assert len({detection.trackId for detection in result}) == 2


def test_same_box_next_frame_keeps_the_same_track_id() -> None:
    tracker = Tracker()
    first = tracker.update([_detection("person", 10, 10)])

    second = tracker.update([_detection("person", 10, 10)])

    assert first[0].trackId == second[0].trackId


def test_slightly_moved_box_still_matches_the_same_track() -> None:
    tracker = Tracker(iou_threshold=0.3)
    first = tracker.update([_detection("person", 10, 10, width=20, height=20)])

    # Small shift — still high IoU overlap with the previous box.
    second = tracker.update([_detection("person", 12, 12, width=20, height=20)])

    assert first[0].trackId == second[0].trackId


def test_non_overlapping_box_starts_a_new_track() -> None:
    tracker = Tracker(iou_threshold=0.3)
    first = tracker.update([_detection("person", 0, 0, width=5, height=5)])

    second = tracker.update([_detection("person", 500, 500, width=5, height=5)])

    assert first[0].trackId != second[0].trackId


def test_different_label_never_matches_even_with_identical_box() -> None:
    tracker = Tracker()
    first = tracker.update([_detection("person", 10, 10)])

    second = tracker.update([_detection("car", 10, 10)])

    assert first[0].trackId != second[0].trackId


def test_track_survives_a_bounded_number_of_missed_frames() -> None:
    tracker = Tracker(iou_threshold=0.3, max_misses=2)
    first = tracker.update([_detection("person", 10, 10)])

    tracker.update([])  # miss 1
    tracker.update([])  # miss 2
    third = tracker.update([_detection("person", 10, 10)])  # still within max_misses

    assert first[0].trackId == third[0].trackId


def test_track_is_dropped_after_exceeding_max_misses() -> None:
    tracker = Tracker(iou_threshold=0.3, max_misses=1)
    first = tracker.update([_detection("person", 10, 10)])

    tracker.update([])  # miss 1
    tracker.update([])  # miss 2 — exceeds max_misses, track dropped

    fourth = tracker.update([_detection("person", 10, 10)])

    assert fourth[0].trackId != first[0].trackId


def test_update_does_not_mutate_the_input_list() -> None:
    tracker = Tracker()
    detections = [_detection("person", 10, 10)]

    tracker.update(detections)

    assert detections[0].trackId is None
