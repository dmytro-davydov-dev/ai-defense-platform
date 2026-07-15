"""REQ-5.9: orchestrates per-frame detect -> filter -> track ->
annotate for one mission's video, plus REQ-5.7's annotated-video
encoding. `kafka/commands_consumer.py` stays the entrypoint that owns
download, metadata extraction, STARTED/COMPLETED/FAILED publishing,
and retry/DLQ (REQ-3.9/3.10) — this module is the real body that
replaces Phase 4's `_count_frames` counting-only loop.

Deliberately synchronous, run via `asyncio.to_thread` from
`commands_consumer.py` as a single blocking call — every step here
(OpenCV decode/encode, ONNX Runtime inference) is CPU-bound, so there
is nothing to gain from `async def` inside this module itself. Kept
separate from `commands_consumer.py` so it is unit-testable against a
scripted/fake detector, with no Kafka/MinIO/ONNX Runtime involved
(REQ-5.11/5.12).

Per-frame `aidefense.detections` events are collected during this
function's run and returned as plain `DetectionEvent` records; the
caller publishes them afterward, in frame order, before
`PROCESSING_COMPLETED` — not streamed in real time mid-mission. Simplest
choice first, per the PRD's Open Questions: this pipeline is a
non-real-time batch step already, so nothing currently needs
sub-mission-duration publish latency; revisit only if Phase 6's UI
demonstrably needs it.
"""

from __future__ import annotations

import os
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

from vision_service.annotation.draw import draw_detections
from vision_service.detection.adapter import DetectorAdapterLike
from vision_service.detection.classes import ALLOWED_CLASSES
from vision_service.detection.filters import filter_detections
from vision_service.detection.tracker import Tracker
from vision_service.frames.models import BoundingBox
from vision_service.settings import settings
from vision_service.video.reader import VideoReader

ANNOTATED_VIDEO_FOURCC = "mp4v"


class DetectionPipelineError(RuntimeError):
    """Raised when the annotated-video encoder can't be opened. REQ-5.10
    routes this through PROCESSING_FAILED/DLQ the same as a decode
    failure.
    """


@dataclass(frozen=True)
class DetectionEvent:
    """One retained (post-filter, post-tracking) detection on one
    frame — the data `commands_consumer.py` turns into a
    `DETECTION_PUBLISHED` envelope per event.
    """

    frame_index: int
    frame_timestamp_ms: float
    track_id: int
    label: str
    confidence: float
    bounding_box: BoundingBox


@dataclass
class DetectionPipelineResult:
    frame_count: int
    detection_events: list[DetectionEvent] = field(default_factory=list)
    track_count: int = 0
    annotated_video_path: Path | None = None
    inference_duration_ms_total: float = 0.0
    inference_duration_ms_avg: float = 0.0


def run_detection_pipeline(
    video_path: Path,
    *,
    detector: DetectorAdapterLike,
    fps: float,
    frame_width: int,
    frame_height: int,
    confidence_threshold: float | None = None,
    allowed_classes: frozenset[str] | None = None,
    annotated_output_path: Path | None = None,
) -> DetectionPipelineResult:
    """Iterates every frame of `video_path` (REQ-4.2's bounded-memory
    generator), running `detector.detect()` -> REQ-5.3/5.4 filtering ->
    a fresh per-mission `Tracker` -> REQ-4.5's annotation, writing the
    annotated frames to `annotated_output_path` (a new temp file if
    omitted — the caller is responsible for uploading and then
    deleting it, same lifecycle as `commands_consumer.py`'s downloaded
    source-video temp file).
    """
    threshold = (
        confidence_threshold
        if confidence_threshold is not None
        else settings.detection_confidence_threshold
    )
    classes = allowed_classes if allowed_classes is not None else ALLOWED_CLASSES

    output_path = annotated_output_path
    if output_path is None:
        fd, tmp_name = tempfile.mkstemp(suffix=".mp4")
        os.close(fd)
        output_path = Path(tmp_name)

    fourcc = cv2.VideoWriter_fourcc(*ANNOTATED_VIDEO_FOURCC)
    writer = cv2.VideoWriter(str(output_path), fourcc, fps or 1.0, (frame_width, frame_height))
    if not writer.isOpened():
        raise DetectionPipelineError(f"could not open annotated-video writer for {output_path}")

    tracker = Tracker()
    events: list[DetectionEvent] = []
    inference_durations_ms: list[float] = []
    seen_track_ids: set[int] = set()
    frame_count = 0

    try:
        with VideoReader(video_path) as reader:
            for frame in reader.frames():
                frame_index = frame_count
                timestamp_ms = (frame_index / fps * 1000.0) if fps > 0 else 0.0

                inference_start = time.monotonic()
                raw_detections = detector.detect(frame)
                inference_durations_ms.append((time.monotonic() - inference_start) * 1000.0)

                filtered = filter_detections(raw_detections, threshold, classes)
                tracked = tracker.update(filtered)

                for detection in tracked:
                    assert detection.trackId is not None  # tracker.update always sets it
                    seen_track_ids.add(detection.trackId)
                    events.append(
                        DetectionEvent(
                            frame_index=frame_index,
                            frame_timestamp_ms=timestamp_ms,
                            track_id=detection.trackId,
                            label=detection.label,
                            confidence=detection.confidence,
                            bounding_box=detection.boundingBox,
                        )
                    )

                annotated_frame: np.ndarray = draw_detections(frame, tracked)
                writer.write(annotated_frame)
                frame_count += 1
    finally:
        writer.release()

    total_ms = sum(inference_durations_ms)
    avg_ms = total_ms / frame_count if frame_count else 0.0

    return DetectionPipelineResult(
        frame_count=frame_count,
        detection_events=events,
        track_count=len(seen_track_ids),
        annotated_video_path=output_path,
        inference_duration_ms_total=total_ms,
        inference_duration_ms_avg=avg_ms,
    )
