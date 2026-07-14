"""REQ-4.6: extracts duration, fps, resolution, and a content checksum
from a source video once, before frame iteration begins — Phase 6's UI
needs this data, and Phase 3's idempotency/audit trail can use the
checksum as a content-stable identifier independent of the MinIO
object key (a re-uploaded, byte-identical video keeps the same
checksum even if it's stored under a different key).
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import cv2
from pydantic import BaseModel, ConfigDict

# Bounded-memory checksum, per docs/architecture/Coding_Standards.md's
# "no unbounded frame accumulation" rule extended to file I/O in
# general — never reads the whole video into memory just to hash it.
CHECKSUM_CHUNK_SIZE = 1024 * 1024  # 1 MiB


class VideoMetadata(BaseModel):
    model_config = ConfigDict(extra="ignore")

    durationSeconds: float
    fps: float
    width: int
    height: int
    frameCount: int
    checksumSha256: str


class MetadataExtractionError(RuntimeError):
    """Raised when OpenCV cannot open the video to read its
    properties — REQ-4.11 routes this through PROCESSING_FAILED/DLQ
    the same as `video.reader.VideoOpenError`.
    """


def _sha256_checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(CHECKSUM_CHUNK_SIZE), b""):
            digest.update(chunk)
    return digest.hexdigest()


def extract_video_metadata(path: str | Path) -> VideoMetadata:
    """Reads container-level properties (fps, frame count, resolution)
    without decoding any frame, then hashes the file in bounded-size
    chunks. `durationSeconds` is derived (`frameCount / fps`) rather
    than read from a container field OpenCV doesn't expose directly —
    `0.0` if `fps` is unavailable (e.g. a zero-frame or malformed
    file), rather than a `ZeroDivisionError`.
    """
    path = Path(path)
    capture = cv2.VideoCapture(str(path))
    try:
        if not capture.isOpened():
            raise MetadataExtractionError(f"could not open video for metadata: {path}")
        fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
        frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        duration_seconds = frame_count / fps if fps > 0 else 0.0
    finally:
        capture.release()

    return VideoMetadata(
        durationSeconds=duration_seconds,
        fps=fps,
        width=width,
        height=height,
        frameCount=frame_count,
        checksumSha256=_sha256_checksum(path),
    )
