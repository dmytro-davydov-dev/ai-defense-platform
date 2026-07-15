"""REQ-5.9/5.12: end-to-end pipeline evaluation against the committed
synthetic fixture (`samples/sample-mission-clip.mp4`, 12 frames, 64x48,
4fps — same fixture Phase 4's `test_commands_consumer.py` uses).

No real `.onnx` model runs here (or anywhere in this sandbox — see
docs/adr/ADR-006-detection-model-and-tracker.md's Risks). This is the
"evaluation fixture" REQ-5.12 calls for applied to what this repository
can actually and honestly verify without a committed model binary
(docs/architecture/Repository_Structure.md's rule): the full
detect -> filter -> track -> annotate pipeline, driven by a scripted,
deterministic detector standing in for the model, with threshold-based
(not exact-match) assertions on the resulting detection/track counts —
exactly the kind of check `docs/architecture/Coding_Standards.md`'s
"model behavior: evaluation fixtures and threshold-based checks"
testing expectation describes.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import cv2

from vision_service.detection.classes import ALLOWED_CLASSES
from vision_service.detection.pipeline import run_detection_pipeline
from vision_service.frames.models import BoundingBox, Detection

REPO_ROOT = Path(__file__).resolve().parents[3]
SAMPLE_VIDEO = REPO_ROOT / "samples" / "sample-mission-clip.mp4"
SAMPLE_FRAME_COUNT = 12
SAMPLE_FPS = 4.0
SAMPLE_WIDTH, SAMPLE_HEIGHT = 64, 48


def _moving_person(frame_index: int) -> Detection:
    """A one-pixel-per-frame drift — well within the tracker's default
    IoU threshold, so this should register as one continuous track
    across all 12 frames.
    """
    return Detection(
        label="person",
        confidence=0.8,
        boundingBox=BoundingBox(x=2 + frame_index, y=2, width=10, height=10),
    )


def _noise_detection() -> Detection:
    """Not in `ALLOWED_CLASSES` — proves REQ-5.3/5.4 filtering runs
    inside the full pipeline, not just in isolation.
    """
    return Detection(
        label="dog",
        confidence=0.95,
        boundingBox=BoundingBox(x=40, y=30, width=8, height=8),
    )


class ScriptedDetectorAdapter:
    def __init__(self, per_frame: list[list[Detection]]) -> None:
        self._per_frame = per_frame
        self.call_count = 0

    def detect(self, frame: Any) -> list[Detection]:
        index = self.call_count
        self.call_count += 1
        return list(self._per_frame[index]) if index < len(self._per_frame) else []


def test_pipeline_iterates_every_frame_of_the_fixture() -> None:
    detector = ScriptedDetectorAdapter([[_moving_person(i)] for i in range(SAMPLE_FRAME_COUNT)])

    result = run_detection_pipeline(
        SAMPLE_VIDEO,
        detector=detector,
        fps=SAMPLE_FPS,
        frame_width=SAMPLE_WIDTH,
        frame_height=SAMPLE_HEIGHT,
    )
    try:
        assert result.frame_count == SAMPLE_FRAME_COUNT
        assert detector.call_count == SAMPLE_FRAME_COUNT
    finally:
        result.annotated_video_path.unlink(missing_ok=True)


def test_pipeline_filters_out_non_allow_listed_classes() -> None:
    detector = ScriptedDetectorAdapter(
        [[_moving_person(i), _noise_detection()] for i in range(SAMPLE_FRAME_COUNT)]
    )

    result = run_detection_pipeline(
        SAMPLE_VIDEO,
        detector=detector,
        fps=SAMPLE_FPS,
        frame_width=SAMPLE_WIDTH,
        frame_height=SAMPLE_HEIGHT,
    )
    try:
        assert {event.label for event in result.detection_events} == {"person"}
        assert len(result.detection_events) == SAMPLE_FRAME_COUNT
        assert "dog" not in ALLOWED_CLASSES
    finally:
        result.annotated_video_path.unlink(missing_ok=True)


def test_pipeline_assigns_one_stable_track_across_all_frames() -> None:
    detector = ScriptedDetectorAdapter([[_moving_person(i)] for i in range(SAMPLE_FRAME_COUNT)])

    result = run_detection_pipeline(
        SAMPLE_VIDEO,
        detector=detector,
        fps=SAMPLE_FPS,
        frame_width=SAMPLE_WIDTH,
        frame_height=SAMPLE_HEIGHT,
    )
    try:
        # REQ-5.5/5.12: threshold-based, not exact-match — at least one
        # track, and specifically exactly one given the 1px/frame drift
        # stays well within the tracker's IoU threshold every frame.
        assert result.track_count == 1
        track_ids = {event.track_id for event in result.detection_events}
        assert track_ids == {result.detection_events[0].track_id}
    finally:
        result.annotated_video_path.unlink(missing_ok=True)


def test_pipeline_writes_a_readable_annotated_video_with_matching_frame_count() -> None:
    detector = ScriptedDetectorAdapter([[_moving_person(i)] for i in range(SAMPLE_FRAME_COUNT)])

    result = run_detection_pipeline(
        SAMPLE_VIDEO,
        detector=detector,
        fps=SAMPLE_FPS,
        frame_width=SAMPLE_WIDTH,
        frame_height=SAMPLE_HEIGHT,
    )
    try:
        assert result.annotated_video_path is not None
        assert result.annotated_video_path.exists()

        capture = cv2.VideoCapture(str(result.annotated_video_path))
        try:
            assert capture.isOpened()
            written_frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
            assert written_frame_count == SAMPLE_FRAME_COUNT
        finally:
            capture.release()
    finally:
        result.annotated_video_path.unlink(missing_ok=True)


def test_pipeline_with_zero_detections_still_writes_every_frame() -> None:
    detector = ScriptedDetectorAdapter([[] for _ in range(SAMPLE_FRAME_COUNT)])

    result = run_detection_pipeline(
        SAMPLE_VIDEO,
        detector=detector,
        fps=SAMPLE_FPS,
        frame_width=SAMPLE_WIDTH,
        frame_height=SAMPLE_HEIGHT,
    )
    try:
        assert result.frame_count == SAMPLE_FRAME_COUNT
        assert result.detection_events == []
        assert result.track_count == 0
        assert result.annotated_video_path.exists()
    finally:
        result.annotated_video_path.unlink(missing_ok=True)


def test_pipeline_reports_inference_duration_metrics() -> None:
    detector = ScriptedDetectorAdapter([[_moving_person(i)] for i in range(SAMPLE_FRAME_COUNT)])

    result = run_detection_pipeline(
        SAMPLE_VIDEO,
        detector=detector,
        fps=SAMPLE_FPS,
        frame_width=SAMPLE_WIDTH,
        frame_height=SAMPLE_HEIGHT,
    )
    try:
        # REQ-5.8: metrics must be present and non-negative — the exact
        # value is meaningless for a scripted detector, only that the
        # accounting itself is correct.
        assert result.inference_duration_ms_total >= 0.0
        assert result.inference_duration_ms_avg >= 0.0
    finally:
        result.annotated_video_path.unlink(missing_ok=True)
