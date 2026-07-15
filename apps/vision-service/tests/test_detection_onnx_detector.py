"""REQ-5.2/5.11: `OnnxDetectorAdapter`'s pre/postprocessing, exercised
against a fake ONNX session with synthetic, hand-built output — never a
real `.onnx` file (docs/adr/ADR-006-detection-model-and-tracker.md's
"Risks": no real model has been run through this adapter in this
sandbox).
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pytest

from vision_service.detection.classes import COCO_CLASSES
from vision_service.detection.onnx_detector import (
    ModelInferenceError,
    ModelNotConfiguredError,
    OnnxDetectorAdapter,
)

PERSON_INDEX = COCO_CLASSES.index("person")
CAR_INDEX = COCO_CLASSES.index("car")


class FakeOnnxInput:
    def __init__(self, name: str) -> None:
        self.name = name


class FakeOnnxSession:
    """`OnnxSessionLike` stand-in — records every input tensor it was
    called with so tests can assert on the preprocessing pipeline
    (shape, dtype), and returns a pre-built output tensor rather than
    running real inference.
    """

    def __init__(self, output: np.ndarray, *, input_name: str = "images") -> None:
        self._output = output
        self._input_name = input_name
        self.received_inputs: list[np.ndarray] = []
        self.raise_on_run: Exception | None = None

    def get_inputs(self) -> list[FakeOnnxInput]:
        return [FakeOnnxInput(self._input_name)]

    def run(self, output_names: Any, input_feed: dict[str, np.ndarray]) -> list[np.ndarray]:
        if self.raise_on_run is not None:
            raise self.raise_on_run
        self.received_inputs.append(input_feed[self._input_name])
        return [self._output]


def _synthetic_yolov8_output(input_size: int = 640) -> np.ndarray:
    """Shape `(1, 4 + 80, 3)` — Ultralytics' native (untransposed)
    layout. Box 0: a confident "person" detection. Box 1: a low-
    confidence noise box (below the adapter's fixed pre-NMS floor).
    Box 2: a confident "car" detection, far enough from box 0 that NMS
    keeps both.
    """
    num_classes = len(COCO_CLASSES)
    output = np.zeros((1, 4 + num_classes, 3), dtype=np.float32)

    # cx, cy, w, h in input-pixel space.
    output[0, 0:4, 0] = [320, 320, 100, 200]
    output[0, 4 + PERSON_INDEX, 0] = 0.90

    output[0, 0:4, 1] = [100, 100, 20, 20]
    output[0, 4 + CAR_INDEX, 1] = 0.05  # below PRE_NMS_SCORE_THRESHOLD (0.20)

    output[0, 0:4, 2] = [450, 450, 60, 60]
    output[0, 4 + CAR_INDEX, 2] = 0.80

    return output


def test_detect_maps_confident_boxes_to_detections_and_drops_low_confidence() -> None:
    session = FakeOnnxSession(_synthetic_yolov8_output())
    adapter = OnnxDetectorAdapter(session=session, input_size=640)
    frame = np.zeros((640, 640, 3), dtype=np.uint8)

    detections = adapter.detect(frame)

    labels = sorted(detection.label for detection in detections)
    assert labels == ["car", "person"]

    person = next(detection for detection in detections if detection.label == "person")
    assert person.confidence == pytest.approx(0.90, abs=1e-3)
    # cx=320, cy=320, w=100, h=200 -> top-left (270, 220), scale 1.0
    # (640x640 frame, 640 input_size).
    assert person.boundingBox.x == pytest.approx(270.0, abs=1e-3)
    assert person.boundingBox.y == pytest.approx(220.0, abs=1e-3)
    assert person.boundingBox.width == pytest.approx(100.0, abs=1e-3)
    assert person.boundingBox.height == pytest.approx(200.0, abs=1e-3)
    assert person.trackId is None  # tracking is a separate stage (REQ-5.5)


def test_detect_rescales_boxes_to_the_original_frame_size() -> None:
    session = FakeOnnxSession(_synthetic_yolov8_output())
    adapter = OnnxDetectorAdapter(session=session, input_size=640)
    # Half-resolution original frame -> boxes should scale by 0.5.
    frame = np.zeros((320, 320, 3), dtype=np.uint8)

    detections = adapter.detect(frame)
    person = next(detection for detection in detections if detection.label == "person")

    assert person.boundingBox.x == pytest.approx(135.0, abs=1e-3)
    assert person.boundingBox.y == pytest.approx(110.0, abs=1e-3)
    assert person.boundingBox.width == pytest.approx(50.0, abs=1e-3)
    assert person.boundingBox.height == pytest.approx(100.0, abs=1e-3)


def test_detect_returns_empty_list_when_nothing_clears_the_score_floor() -> None:
    num_classes = len(COCO_CLASSES)
    output = np.zeros((1, 4 + num_classes, 1), dtype=np.float32)
    output[0, 0:4, 0] = [320, 320, 50, 50]
    output[0, 4 + PERSON_INDEX, 0] = 0.01

    session = FakeOnnxSession(output)
    adapter = OnnxDetectorAdapter(session=session, input_size=640)

    detections = adapter.detect(np.zeros((640, 640, 3), dtype=np.uint8))

    assert detections == []


def test_detect_sends_a_chw_float32_batch_of_one_to_the_session() -> None:
    session = FakeOnnxSession(_synthetic_yolov8_output())
    adapter = OnnxDetectorAdapter(session=session, input_size=640)

    adapter.detect(np.zeros((640, 640, 3), dtype=np.uint8))

    assert len(session.received_inputs) == 1
    tensor = session.received_inputs[0]
    assert tensor.shape == (1, 3, 640, 640)
    assert tensor.dtype == np.float32


def test_detect_wraps_a_session_run_failure_in_model_inference_error() -> None:
    session = FakeOnnxSession(_synthetic_yolov8_output())
    session.raise_on_run = RuntimeError("onnxruntime internal error")
    adapter = OnnxDetectorAdapter(session=session, input_size=640)

    with pytest.raises(ModelInferenceError):
        adapter.detect(np.zeros((640, 640, 3), dtype=np.uint8))


def test_construction_without_a_configured_path_or_session_raises() -> None:
    with pytest.raises(ModelNotConfiguredError):
        OnnxDetectorAdapter(model_path=None)
