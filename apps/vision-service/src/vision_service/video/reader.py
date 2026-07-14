"""REQ-4.2: OpenCV-based video reader with a bounded-memory frame
generator. `frames()` yields one decoded frame at a time and never
accumulates the whole video in memory — per
docs/architecture/Coding_Standards.md's "no unbounded frame
accumulation" rule. Used both directly (REQ-4.6's metadata pass reads
capture properties without full decode) and via `frames()` for
REQ-4.10's real per-frame iteration in `kafka/commands_consumer.py`.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from types import TracebackType

import cv2
import numpy as np


class VideoOpenError(RuntimeError):
    """Raised when OpenCV cannot open/decode the given video path —
    e.g. a corrupt file, an unsupported codec, or a missing path. This
    is the failure REQ-4.11 routes through PROCESSING_FAILED/DLQ
    rather than an unhandled exception.
    """


class VideoReader:
    """Wraps `cv2.VideoCapture` for one video file. Use as a context
    manager so the underlying capture handle is always released, even
    if frame iteration raises partway through:

        with VideoReader(path) as reader:
            for frame in reader.frames():
                ...  # frame: HxWxC uint8 BGR ndarray
    """

    def __init__(self, path: str | Path) -> None:
        self._path = str(path)
        self._capture = cv2.VideoCapture(self._path)
        if not self._capture.isOpened():
            self._capture.release()
            raise VideoOpenError(f"could not open video: {self._path}")

    def __enter__(self) -> VideoReader:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        self.release()

    def release(self) -> None:
        self._capture.release()

    def frames(self) -> Iterator[np.ndarray]:
        """Yields one `HxWxC uint8` BGR frame at a time (OpenCV's
        native decode order/dtype). Stops at end-of-stream or the
        first decode failure — whichever comes first — without ever
        holding more than one frame in memory at once.
        """
        while True:
            ok, frame = self._capture.read()
            if not ok:
                return
            yield frame
