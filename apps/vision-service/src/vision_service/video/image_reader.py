"""REQ-4.3: single-image input, read through the same OpenCV decode
path as video frames so `vision_service.frames`/`vision_service.annotation`
are not video-only from day one.
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np


class ImageReadError(RuntimeError):
    """Raised when OpenCV cannot decode the given image path — mirrors
    `video.reader.VideoOpenError`'s role for the image input path.
    """


def read_image(path: str | Path) -> np.ndarray:
    """Returns a single `HxWxC uint8` BGR ndarray (OpenCV's native
    decode order/dtype — same shape/dtype convention as one frame from
    `VideoReader.frames()`, so downstream preprocessing/annotation
    code doesn't need to special-case images vs. video frames).
    """
    image = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if image is None:
        raise ImageReadError(f"could not read image: {path}")
    return image
