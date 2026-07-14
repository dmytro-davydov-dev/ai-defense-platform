"""REQ-4.9/4.12: Frame/Detection/BoundingBox contracts."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from vision_service.frames.models import BoundingBox, Detection, Frame


def _detection(confidence: float = 0.5) -> Detection:
    return Detection(
        label="person",
        confidence=confidence,
        boundingBox=BoundingBox(x=1, y=2, width=3, height=4),
    )


def test_frame_defaults_to_no_detections_and_three_channels() -> None:
    frame = Frame(frameIndex=0, timestampMs=0.0, height=48, width=64)

    assert frame.channels == 3
    assert frame.detections == []


def test_frame_carries_detections() -> None:
    frame = Frame(
        frameIndex=1,
        timestampMs=250.0,
        height=48,
        width=64,
        detections=[_detection()],
    )

    assert len(frame.detections) == 1
    assert frame.detections[0].label == "person"


@pytest.mark.parametrize("confidence", [-0.1, 1.1])
def test_detection_confidence_must_be_in_unit_range(confidence: float) -> None:
    with pytest.raises(ValidationError):
        _detection(confidence=confidence)


def test_frame_rejects_non_positive_dimensions() -> None:
    with pytest.raises(ValidationError):
        Frame(frameIndex=0, timestampMs=0.0, height=0, width=64)


def test_frame_rejects_negative_frame_index() -> None:
    with pytest.raises(ValidationError):
        Frame(frameIndex=-1, timestampMs=0.0, height=48, width=64)
