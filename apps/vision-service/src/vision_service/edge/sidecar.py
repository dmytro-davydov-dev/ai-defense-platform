"""REQ-9.3/9.4 (docs/mvp-plan/PRD-Phase-9.md),
docs/adr/ADR-010-edge-runtime-language-and-inference-strategy.md: the
edge inference sidecar. `apps/edge-agent` (a TypeScript/Node process)
spawns and supervises this as a long-running child process, run via
`python -m vision_service.edge.sidecar --video-path <path> [--loop]`.

Reuses Phase 5's exact building blocks, completely unchanged:
`detection.factory.build_detector()` (honors
`VISION_SERVICE_DETECTION_MODEL_PATH` exactly as the cloud pipeline
does — the Node parent resolves and downloads the production model
itself, per ADR-011, then sets this env var before spawning this
process; this module never talks to the model registry or MinIO),
`detection.filters.filter_detections()` (and therefore
`detection.classes.ALLOWED_CLASSES` — the Phase 5 safety boundary,
applied identically here), `detection.tracker.Tracker`, and
`video.reader.VideoReader`.

IPC PROTOCOL — READ BEFORE EDITING THIS FILE. `stdout` carries ONLY
newline-delimited JSON objects of the following shapes, and NOTHING
else:

    {"type": "ready"}                             — once, after the
                                                     detector/video
                                                     source open
    {"type": "detection", "frameIndex": ..., ...} — one per retained
                                                     (post-filter,
                                                     post-tracking)
                                                     detection
    {"type": "error", "message": "..."}           — a fatal error;
                                                     the process exits
                                                     non-zero right
                                                     after

Every other log line MUST go to stderr — this module deliberately does
NOT use `vision_service.observability.log()`, which writes `info`/
`debug` to stdout. A stray `print()` anywhere in this module silently
corrupts the protocol `apps/edge-agent`'s process manager depends on.
"""

from __future__ import annotations

import argparse
import json
import signal
import sys
from pathlib import Path
from types import FrameType
from typing import Any

from vision_service.detection.classes import ALLOWED_CLASSES
from vision_service.detection.factory import build_detector
from vision_service.detection.filters import filter_detections
from vision_service.detection.tracker import Tracker
from vision_service.metadata.extract import MetadataExtractionError, extract_video_metadata
from vision_service.settings import settings
from vision_service.video.reader import VideoOpenError, VideoReader


def _emit(record: dict[str, Any]) -> None:
    """The only function in this module allowed to write to stdout —
    see the module docstring's IPC protocol.
    """
    print(json.dumps(record), file=sys.stdout, flush=True)


def _log_stderr(message: str, **fields: Any) -> None:
    """Mirrors `vision_service.observability.log()`'s JSON-line shape,
    but unconditionally to stderr — see the module docstring for why
    this module never calls `observability.log()` directly (it writes
    info/debug to stdout).
    """
    record = {"level": "info", "message": message, **fields}
    print(json.dumps(record), file=sys.stderr, flush=True)


class SidecarStopError(Exception):
    """Raised from the SIGTERM/SIGINT handler to unwind the frame loop
    cleanly, letting `run()` return 0 rather than dying mid-frame.
    """


def _install_signal_handlers() -> None:
    def _handler(signum: int, _frame: FrameType | None) -> None:
        raise SidecarStopError(f"received signal {signum}")

    signal.signal(signal.SIGTERM, _handler)
    signal.signal(signal.SIGINT, _handler)


def run(video_path: Path, *, loop: bool, confidence_threshold: float | None) -> int:
    """Runs the detect -> filter -> track loop against `video_path`
    until end-of-stream (or forever, if `loop`), emitting one
    `{"type": "detection", ...}` line per retained detection. Returns a
    process exit code — 0 for a clean stop (signal or non-looping
    end-of-stream), 1 for a fatal error (video open failure or an
    unrecoverable detection-pipeline exception; there is no per-mission
    retry/DLQ concept at the edge in this phase — `apps/edge-agent` is
    responsible for deciding whether/when to restart this process, per
    docs/adr/ADR-010-edge-runtime-language-and-inference-strategy.md's
    Consequences section).
    """
    threshold = (
        confidence_threshold
        if confidence_threshold is not None
        else settings.detection_confidence_threshold
    )

    try:
        metadata = extract_video_metadata(video_path)
    except MetadataExtractionError as error:
        _emit({"type": "error", "message": str(error)})
        return 1
    fps = metadata.fps or 1.0

    detector = build_detector()
    _log_stderr(
        "edge sidecar starting",
        videoPath=str(video_path),
        fps=fps,
        loop=loop,
        confidenceThreshold=threshold,
    )

    _install_signal_handlers()
    _emit({"type": "ready"})

    frame_index = 0
    try:
        while True:
            tracker = Tracker()
            try:
                with VideoReader(video_path) as reader:
                    for frame in reader.frames():
                        timestamp_ms = (frame_index / fps * 1000.0) if fps > 0 else 0.0
                        raw_detections = detector.detect(frame)
                        filtered = filter_detections(raw_detections, threshold, ALLOWED_CLASSES)
                        tracked = tracker.update(filtered)

                        for detection in tracked:
                            _emit(
                                {
                                    "type": "detection",
                                    "frameIndex": frame_index,
                                    "frameTimestampMs": timestamp_ms,
                                    "trackId": detection.trackId,
                                    "label": detection.label,
                                    "confidence": detection.confidence,
                                    "boundingBox": {
                                        "x": detection.boundingBox.x,
                                        "y": detection.boundingBox.y,
                                        "width": detection.boundingBox.width,
                                        "height": detection.boundingBox.height,
                                    },
                                }
                            )
                        frame_index += 1
            except VideoOpenError as error:
                _emit({"type": "error", "message": str(error)})
                return 1
            except SidecarStopError:
                raise
            except Exception as error:  # noqa: BLE001 - deliberately broad, see run()'s docstring
                _emit({"type": "error", "message": f"detection pipeline error: {error}"})
                return 1

            if not loop:
                break
            _log_stderr("edge sidecar: video source exhausted, looping", frameIndex=frame_index)
    except SidecarStopError as stop:
        _log_stderr("edge sidecar shutting down", reason=str(stop))
        return 0

    _log_stderr("edge sidecar: video source exhausted, not looping, exiting")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Phase 9 edge inference sidecar — see this module's "
            "docstring for its stdout IPC protocol."
        ),
    )
    parser.add_argument("--video-path", required=True, type=Path)
    parser.add_argument(
        "--loop",
        action="store_true",
        help="Restart from the beginning of the video source on end-of-stream instead of exiting.",
    )
    parser.add_argument("--confidence-threshold", type=float, default=None)
    args = parser.parse_args()

    exit_code = run(
        args.video_path,
        loop=args.loop,
        confidence_threshold=args.confidence_threshold,
    )
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
