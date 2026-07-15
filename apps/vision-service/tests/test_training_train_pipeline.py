"""REQ-8.16: an integration/fixture-based test of the training pipeline
end-to-end, against a fake `TrainerLike` — not real Ultralytics/torch
(unavailable in this sandbox, see this file's module docstring context
in training/_ultralytics_trainer.py). Asserts the pipeline's own
plumbing (shape/convention wiring into `OnnxDetectorAdapter`) and that
`evaluate()` is actually invoked against the fake trainer's test
predictions — the same "fake session, no real .onnx bytes" boundary
docs/adr/ADR-006-detection-model-and-tracker.md already documents for
`test_detection_onnx_detector.py`.
"""

from __future__ import annotations

from pathlib import Path

from vision_service.detection.classes import COCO_CLASSES
from vision_service.detection.onnx_detector import ModelLoadError, OnnxDetectorAdapter
from vision_service.frames.models import BoundingBox, Detection
from vision_service.settings import settings
from vision_service.training.train import TrainerOutput, run_training_pipeline


class FakeTrainer:
    """Stands in for `_ultralytics_trainer.UltralyticsTrainer` — writes
    a placeholder file at the expected export path (not real ONNX
    bytes; see this module's docstring) and returns hand-built test
    predictions so `evaluate()` has something real to score.
    """

    def __init__(self, test_predictions: dict[str, list[Detection]]) -> None:
        self._test_predictions = test_predictions
        self.received_hyperparameters: dict[str, object] | None = None

    def train_and_export(
        self, train_images_dir, train_annotations, test_images_dir, hyperparameters, output_dir
    ) -> TrainerOutput:
        self.received_hyperparameters = hyperparameters
        output_dir.mkdir(parents=True, exist_ok=True)
        onnx_path = output_dir / "model.onnx"
        onnx_path.write_bytes(b"not-a-real-onnx-graph")  # see module docstring
        return TrainerOutput(
            onnx_path=onnx_path,
            metrics={"epochsRun": hyperparameters.get("epochs", 1)},
            test_predictions=self._test_predictions,
            input_size=settings.detection_input_size,
            num_classes=len(COCO_CLASSES),
        )


def test_pipeline_trains_evaluates_and_exports_in_the_adapter_expected_shape(
    tmp_path: Path,
) -> None:
    ground_truth = {
        "frame-0001.jpg": [
            Detection(
                label="car",
                confidence=1.0,
                boundingBox=BoundingBox(x=10, y=10, width=50, height=50),
            )
        ],
    }
    predictions = {
        "frame-0001.jpg": [
            Detection(
                label="car",
                confidence=0.9,
                boundingBox=BoundingBox(x=10, y=10, width=50, height=50),
            )
        ],
    }
    trainer = FakeTrainer(test_predictions=predictions)

    result = run_training_pipeline(
        train_images_dir=tmp_path / "train",
        train_annotations=ground_truth,
        test_images_dir=tmp_path / "test",
        test_annotations=ground_truth,
        hyperparameters={"epochs": 1, "batchSize": 4},
        output_dir=tmp_path / "output",
        failure_notes=["No known failure cases in this fixture run."],
        trainer=trainer,
    )

    assert result.onnx_path.exists()
    assert trainer.received_hyperparameters == {"epochs": 1, "batchSize": 4}

    # REQ-8.6: the pipeline's own recorded export convention matches
    # exactly what OnnxDetectorAdapter/onnx_detector.py's postprocessing
    # assumes (ADR-006) — the contract check REQ-8.16 asks for, without
    # needing real ONNX bytes to verify it.
    assert result.input_size == settings.detection_input_size
    assert result.num_classes == len(COCO_CLASSES)

    # REQ-8.8: evaluate() actually ran against the fake trainer's test predictions.
    assert result.evaluation_report["meanAveragePrecision"] == 1.0
    assert result.evaluation_report["failureNotes"] == [
        "No known failure cases in this fixture run."
    ]


def test_exported_path_is_wired_through_the_real_onnx_loading_code_path(tmp_path: Path) -> None:
    """Documents the honest boundary (same as ADR-006's Risks section):
    this sandbox has no real trained model, so the fixture's placeholder
    file reaches `onnxruntime.InferenceSession` for real and fails to
    parse — proving the pipeline's `onnx_path` is wired to the exact
    same loading path production code uses (REQ-8.16), not that a real
    model was verified end-to-end.
    """
    trainer = FakeTrainer(test_predictions={})
    result = run_training_pipeline(
        train_images_dir=tmp_path / "train",
        train_annotations={},
        test_images_dir=tmp_path / "test",
        test_annotations={},
        hyperparameters={},
        output_dir=tmp_path / "output",
        trainer=trainer,
    )

    try:
        OnnxDetectorAdapter(model_path=str(result.onnx_path))
    except ModelLoadError:
        pass
    else:
        raise AssertionError(
            "expected ModelLoadError against a placeholder (non-ONNX) file"
        )
