"""REQ-4.4: resize/normalize preprocessing on a decoded frame.

Array shape/dtype convention, per
docs/architecture/Coding_Standards.md's "NumPy array shapes documented"
rule: every function here takes and/or returns an `HxWxC` ndarray.
`resize()` stays `uint8` end-to-end (no dtype change); `normalize()` is
the one function in this module that converts `uint8` -> `float32` — a
caller never gets a silently-mixed-dtype array back from either.
"""

from __future__ import annotations

import cv2
import numpy as np


def resize(frame: np.ndarray, width: int, height: int) -> np.ndarray:
    """`HxWxC uint8` -> `height x width x C uint8`, resized in place
    (a new array, input is not mutated). `width`/`height` must be
    positive.
    """
    if width <= 0 or height <= 0:
        raise ValueError(f"width/height must be positive, got ({width}, {height})")
    return cv2.resize(frame, (width, height), interpolation=cv2.INTER_LINEAR)


def normalize(frame: np.ndarray) -> np.ndarray:
    """`HxWxC uint8` in `[0, 255]` -> `HxWxC float32` in `[0.0, 1.0]`.
    Does not mutate the input array.
    """
    return frame.astype(np.float32) / 255.0
