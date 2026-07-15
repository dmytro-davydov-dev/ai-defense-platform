"""REQ-9.3/9.4 (docs/mvp-plan/PRD-Phase-9.md): the edge inference
sidecar reuses Phase 5's exact detect -> filter -> track building
blocks (`detection.factory.build_detector()`,
`detection.filters.filter_detections()`,
`detection.classes.ALLOWED_CLASSES`, `detection.tracker.Tracker`) —
this test monkeypatches only `build_detector()` (the model itself,
same seam `test_detection_factory.py` and `test_detection_pipeline.py`
already use), never the filter/allow-list/tracker, so a passing test
here is real evidence the safety boundary
docs/adr/ADR-010-edge-runtime-language-and-inference-strategy.md
promises is reused unchanged actually is.

Also asserts the stdout IPC protocol the sidecar's own module docstring
commits to: only `{"type": ...}` JSON lines on stdout, ever.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from vision_service.detection.classes import ALLOWED_CLASSES
from vision_service.edge import sidecar
from vision_service.frames.models import BoundingBox, Detection

REPO_ROOT = Path(__file__).resolve().parents[3]
SAMPLE_VIDEO = REPO_ROOT / "samples" / "sample-mission-clip.mp4"
SAMPLE_FRAME_COUNT = 12
SAMPLE_FPS = 4.0


class ScriptedDetectorAdapter:
    def __init__(self, per_frame: list[list[Detection]]) -> None:
        self._per_frame = per_frame
        self.call_count = 0

    def detect(self, frame: Any) -> list[Detection]:
        index = self.call_count
        self.call_count += 1
        return list(self._per_frame[index]) if index < len(self._per_frame) else []


def _moving_person(frame_index: int) -> Detection:
    return Detection(
        label="person",
        confidence=0.8,
        boundingBox=BoundingBox(x=2 + frame_index, y=2, width=10, height=10),
    )


def _noise_detection() -> Detection:
    """Not in `ALLOWED_CLASSES` — proves the sidecar's filtering stage
    runs for real, not mocked away.
    """
    return Detection(
        label="dog",
        confidence=0.95,
        boundingBox=BoundingBox(x=40, y=30, width=8, height=8),
    )


def _stdout_records(capsys: pytest.CaptureFixture[str]) -> list[dict[str, Any]]:
    captured = capsys.readouterr()
    lines = [line for line in captured.out.splitlines() if line.strip()]
    return [json.loads(line) for line in lines]


def test_sidecar_emits_ready_then_one_detection_per_retained_frame(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(
        sidecar,
        "build_detector",
        lambda: ScriptedDetectorAdapter([[_moving_person(i)] for i in range(SAMPLE_FRAME_COUNT)]),
    )

    exit_code = sidecar.run(SAMPLE_VIDEO, loop=False, confidence_threshold=None)

    assert exit_code == 0
    records = _stdout_records(capsys)
    assert records[0] == {"type": "ready"}
    detections = [r for r in records if r["type"] == "detection"]
    assert len(detections) == SAMPLE_FRAME_COUNT
    assert {d["label"] for d in detections} == {"person"}
    assert detections[0]["frameIndex"] == 0
    assert detections[-1]["frameIndex"] == SAMPLE_FRAME_COUNT - 1


def test_sidecar_filters_out_non_allow_listed_classes(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(
        sidecar,
        "build_detector",
        lambda: ScriptedDetectorAdapter(
            [[_moving_person(i), _noise_detection()] for i in range(SAMPLE_FRAME_COUNT)]
        ),
    )

    exit_code = sidecar.run(SAMPLE_VIDEO, loop=False, confidence_threshold=None)

    assert exit_code == 0
    detections = [r for r in _stdout_records(capsys) if r["type"] == "detection"]
    assert {d["label"] for d in detections} == {"person"}
    assert "dog" not in ALLOWED_CLASSES


def test_sidecar_assigns_one_stable_track_across_all_frames(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(
        sidecar,
        "build_detector",
        lambda: ScriptedDetectorAdapter([[_moving_person(i)] for i in range(SAMPLE_FRAME_COUNT)]),
    )

    sidecar.run(SAMPLE_VIDEO, loop=False, confidence_threshold=None)

    detections = [r for r in _stdout_records(capsys) if r["type"] == "detection"]
    track_ids = {d["trackId"] for d in detections}
    assert track_ids == {detections[0]["trackId"]}


def test_sidecar_reports_a_fatal_error_and_exits_nonzero_for_a_missing_video(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(sidecar, "build_detector", lambda: ScriptedDetectorAdapter([]))

    exit_code = sidecar.run(
        REPO_ROOT / "samples" / "does-not-exist.mp4", loop=False, confidence_threshold=None
    )

    assert exit_code == 1
    records = _stdout_records(capsys)
    assert records[-1]["type"] == "error"
    # No "ready"/"detection" line should ever precede a startup failure.
    assert all(r["type"] == "error" for r in records)


def test_sidecar_respects_an_explicit_confidence_threshold_override(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    low_confidence_person = Detection(
        label="person", confidence=0.1, boundingBox=BoundingBox(x=2, y=2, width=10, height=10)
    )
    monkeypatch.setattr(
        sidecar,
        "build_detector",
        lambda: ScriptedDetectorAdapter(
            [[low_confidence_person] for _ in range(SAMPLE_FRAME_COUNT)]
        ),
    )

    sidecar.run(SAMPLE_VIDEO, loop=False, confidence_threshold=0.5)

    detections = [r for r in _stdout_records(capsys) if r["type"] == "detection"]
    assert detections == []
