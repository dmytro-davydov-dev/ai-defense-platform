"""REQ-4.5: draws bounding boxes and labels onto a frame given a list
of `Detection` objects. Implemented and unit-tested against hand-
constructed `Detection` fixtures this phase, since no real model
output exists until Phase 5 (PRD-Phase-4 non-goals) — nothing calls
this with real detections yet.
"""

from __future__ import annotations

import cv2
import numpy as np

from vision_service.frames.models import Detection

BOX_COLOR = (0, 255, 0)  # BGR green — matches OpenCV's native decode order.
LABEL_COLOR = (0, 0, 0)
LABEL_FONT = cv2.FONT_HERSHEY_SIMPLEX
LABEL_FONT_SCALE = 0.5
LABEL_THICKNESS = 1
BOX_THICKNESS = 2


def draw_detections(frame: np.ndarray, detections: list[Detection]) -> np.ndarray:
    """Returns a new `HxWxC uint8` frame with each detection's
    bounding box and `"<label> <confidence%>"` text drawn on it. Does
    not mutate `frame` — callers that need the original frame kept
    intact (e.g. to also feed a model in Phase 5) don't need to copy
    defensively themselves.
    """
    annotated = frame.copy()
    for detection in detections:
        box = detection.boundingBox
        top_left = (int(round(box.x)), int(round(box.y)))
        bottom_right = (int(round(box.x + box.width)), int(round(box.y + box.height)))
        cv2.rectangle(annotated, top_left, bottom_right, BOX_COLOR, BOX_THICKNESS)

        label = f"{detection.label} {detection.confidence:.0%}"
        label_origin = (top_left[0], max(top_left[1] - 8, 0))
        cv2.putText(
            annotated,
            label,
            label_origin,
            LABEL_FONT,
            LABEL_FONT_SCALE,
            LABEL_COLOR,
            LABEL_THICKNESS,
            cv2.LINE_AA,
        )
    return annotated
