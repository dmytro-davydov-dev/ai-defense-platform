"""REQ-5.2: ONNX Runtime-backed implementation of `DetectorAdapterLike`.
Assumes the standard Ultralytics YOLOv8 ONNX export layout — a static
square input and a single output tensor shaped
`(1, 4 + num_classes, num_boxes)` in `(cx, cy, w, h)` pixel-space
(relative to the model's input size, not `[0, 1]`) — per
docs/adr/ADR-006-detection-model-and-tracker.md. CPU-only
(`CPUExecutionProvider`) this phase; GPU/TensorRT is Phase 9's concern,
behind this same `DetectorAdapterLike` interface.

The `session` constructor parameter exists purely for REQ-5.11's unit
tests: passing a fake `OnnxSessionLike` exercises the pre/postprocessing
math (resize/normalize, transpose, NMS, coordinate rescaling) without a
real `.onnx` file or a real `onnxruntime.InferenceSession`.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Protocol

import cv2
import numpy as np
import onnxruntime

from vision_service.detection.classes import COCO_CLASSES
from vision_service.frames import preprocessing
from vision_service.frames.models import BoundingBox, Detection
from vision_service.settings import settings

# A loose, fixed pre-NMS score floor — independent of REQ-5.3's
# configurable `settings.detection_confidence_threshold`, which is
# applied downstream by `detection/filters.py`. This floor exists only
# to keep the NMS candidate set small; it must stay <= any sane
# REQ-5.3 threshold so it never discards something REQ-5.3 would have
# kept.
PRE_NMS_SCORE_THRESHOLD = 0.20
NMS_IOU_THRESHOLD = 0.45


class ModelNotConfiguredError(RuntimeError):
    """`VISION_SERVICE_DETECTION_MODEL_PATH` is unset. Callers should
    prefer `detection.factory.detector`, which never raises this —
    `detection/factory.py` falls back to `NullDetectorAdapter` instead
    of constructing this class at all when unconfigured.
    """


class ModelLoadError(RuntimeError):
    """ONNX Runtime could not load the model at the configured path
    (missing file, corrupt/incompatible ONNX graph, ...). REQ-5.10
    routes this through PROCESSING_FAILED/DLQ the same as
    `video.reader.VideoOpenError`.
    """


class ModelInferenceError(RuntimeError):
    """A `session.run()` call failed on an otherwise-loaded model
    (e.g. an unexpected input shape). REQ-5.10 routes this through
    PROCESSING_FAILED/DLQ the same as a decode failure.
    """


class OnnxSessionLike(Protocol):
    def get_inputs(self) -> Sequence[Any]: ...

    def run(
        self, output_names: list[str] | None, input_feed: dict[str, np.ndarray]
    ) -> list[np.ndarray]: ...


def _build_session(model_path: str) -> onnxruntime.InferenceSession:
    try:
        return onnxruntime.InferenceSession(model_path, providers=["CPUExecutionProvider"])
    except Exception as error:  # onnxruntime raises its own broad Fail/InvalidGraph types
        raise ModelLoadError(f"failed to load ONNX model at {model_path}: {error}") from error


def _postprocess(
    output: np.ndarray,
    input_size: int,
    original_width: int,
    original_height: int,
    class_names: Sequence[str],
    score_threshold: float,
    nms_iou_threshold: float,
) -> list[Detection]:
    """`output`: the model's raw first output tensor, shape
    `(1, 4 + len(class_names), num_boxes)` (Ultralytics' native layout)
    or already-transposed `(1, num_boxes, 4 + len(class_names))` —
    both are accepted since some export settings differ on this.
    Returns detections rescaled into the *original* frame's pixel
    space, top-left `(x, y)` + `width`/`height` — the same convention
    `annotation.draw`/`frames.models.BoundingBox` already use.
    """
    predictions = output[0]
    if predictions.shape[0] == 4 + len(class_names):
        predictions = predictions.T  # -> (num_boxes, 4 + num_classes)

    boxes_cxcywh = predictions[:, :4]
    class_scores = predictions[:, 4:]
    class_ids = np.argmax(class_scores, axis=1)
    confidences = class_scores[np.arange(len(class_scores)), class_ids]

    keep_mask = confidences >= score_threshold
    boxes_cxcywh = boxes_cxcywh[keep_mask]
    class_ids = class_ids[keep_mask]
    confidences = confidences[keep_mask]

    if len(boxes_cxcywh) == 0:
        return []

    scale_x = original_width / input_size
    scale_y = original_height / input_size

    nms_boxes: list[list[float]] = []
    for cx, cy, w, h in boxes_cxcywh:
        x = (cx - w / 2) * scale_x
        y = (cy - h / 2) * scale_y
        nms_boxes.append([float(x), float(y), float(w * scale_x), float(h * scale_y)])

    indices = cv2.dnn.NMSBoxes(nms_boxes, confidences.tolist(), score_threshold, nms_iou_threshold)
    flat_indices = np.array(indices).flatten() if len(indices) else np.array([], dtype=int)

    detections: list[Detection] = []
    for index in flat_indices:
        x, y, w, h = nms_boxes[int(index)]
        class_id = int(class_ids[int(index)])
        label = class_names[class_id] if class_id < len(class_names) else f"class_{class_id}"
        detections.append(
            Detection(
                label=label,
                confidence=float(confidences[int(index)]),
                boundingBox=BoundingBox(x=x, y=y, width=w, height=h),
            )
        )
    return detections


class OnnxDetectorAdapter:
    """REQ-5.2: loads a YOLOv8-layout ONNX model once at construction
    and runs CPU inference per frame via `detect()`.
    """

    def __init__(
        self,
        model_path: str | None = None,
        *,
        session: OnnxSessionLike | None = None,
        input_size: int | None = None,
    ) -> None:
        self._input_size = input_size or settings.detection_input_size
        if session is not None:
            self._session: OnnxSessionLike = session
        else:
            resolved_path = model_path or settings.detection_model_path
            if not resolved_path:
                raise ModelNotConfiguredError(
                    "VISION_SERVICE_DETECTION_MODEL_PATH is not set — construct via "
                    "detection.factory.detector instead, which falls back to "
                    "NullDetectorAdapter rather than raising."
                )
            self._session = _build_session(resolved_path)
        self._input_name = self._session.get_inputs()[0].name

    def detect(self, frame: np.ndarray) -> list[Detection]:
        original_height, original_width = frame.shape[:2]
        resized = preprocessing.resize(frame, self._input_size, self._input_size)
        normalized = preprocessing.normalize(resized)  # HxWxC float32 in [0, 1]

        # HxWxC BGR (OpenCV's native order) -> CxHxW RGB (Ultralytics'
        # ONNX export convention), with a leading batch dimension.
        rgb = normalized[:, :, ::-1]
        input_tensor = np.ascontiguousarray(
            np.transpose(rgb, (2, 0, 1))[np.newaxis, ...], dtype=np.float32
        )

        try:
            outputs = self._session.run(None, {self._input_name: input_tensor})
        except Exception as error:
            raise ModelInferenceError(f"ONNX Runtime inference failed: {error}") from error

        return _postprocess(
            outputs[0],
            self._input_size,
            original_width,
            original_height,
            COCO_CLASSES,
            PRE_NMS_SCORE_THRESHOLD,
            NMS_IOU_THRESHOLD,
        )
