"""REQ-4.5: draws bounding boxes and labels onto a frame given a list
of `Detection` objects. Unit-tested (Phase 4) against hand-constructed
`Detection` fixtures; Phase 5's `detection.pipeline.run_detection_pipeline`
is the first caller to pass real, tracked detections (REQ-5.7) — the
label now includes the track ID when one is present (`Detection.trackId`
is `None` for hand-built fixtures that never went through
`detection.tracker.Tracker`, so the label format is unchanged for those).
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

        if detection.trackId is not None:
            label = f"{detection.label} #{detection.trackId} {detection.confidence:.0%}"
        else:
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
