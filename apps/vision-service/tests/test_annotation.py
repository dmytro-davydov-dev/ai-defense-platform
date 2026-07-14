"""REQ-4.5/4.12: bounding-box/label annotation, against hand-built
`Detection` fixtures (no real model output exists until Phase 5).
"""

from __future__ import annotations

import numpy as np

from vision_service.annotation.draw import draw_detections
from vision_service.frames.models import BoundingBox, Detection


def _sample_frame() -> np.ndarray:
    return np.zeros((48, 64, 3), dtype=np.uint8)


def test_draw_detections_returns_same_shape_and_dtype() -> None:
    frame = _sample_frame()
    detections = [
        Detection(
            label="person",
            confidence=0.87,
            boundingBox=BoundingBox(x=5, y=5, width=20, height=30),
        )
    ]

    annotated = draw_detections(frame, detections)

    assert annotated.shape == frame.shape
    assert annotated.dtype == frame.dtype


def test_draw_detections_does_not_mutate_input_frame() -> None:
    frame = _sample_frame()
    original = frame.copy()
    detections = [
        Detection(
            label="vehicle",
            confidence=0.5,
            boundingBox=BoundingBox(x=0, y=0, width=10, height=10),
        )
    ]

    draw_detections(frame, detections)

    assert np.array_equal(frame, original)


def test_draw_detections_actually_draws_something() -> None:
    frame = _sample_frame()
    detections = [
        Detection(
            label="person",
            confidence=0.99,
            boundingBox=BoundingBox(x=2, y=2, width=40, height=30),
        )
    ]

    annotated = draw_detections(frame, detections)

    assert not np.array_equal(annotated, frame)


def test_draw_detections_with_empty_list_returns_unchanged_copy() -> None:
    frame = _sample_frame()

    annotated = draw_detections(frame, [])

    assert np.array_equal(annotated, frame)
    assert annotated is not frame
