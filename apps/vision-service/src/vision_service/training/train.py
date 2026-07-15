"""PRD-Phase-8 (docs/mvp-plan/PRD-Phase-8.md) REQ-8.6/8.7/8.16: the
training pipeline orchestrator — CLI entry point is
`apps/vision-service/scripts/run_training.py`, mirroring
`scripts/generate_samples.py`'s existing "batch job, not a deployed
service" shape.

`run_training_pipeline()` is deliberately trainer-agnostic: the real
Ultralytics-backed implementation
(`training._ultralytics_trainer.UltralyticsTrainer`) is only imported
lazily by `_default_trainer()`, so this module — and REQ-8.16's fixture
test — never require `ultralytics`/`torch` to be importable. This is
the same injectable-dependency shape
`detection.onnx_detector.OnnxDetectorAdapter` already uses for its
`session` parameter (REQ-5.11).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from vision_service.frames.models import Detection
from vision_service.settings import settings
from vision_service.storage.minio_client import MinioClient
from vision_service.training import registry_client
from vision_service.training.evaluate import evaluate


@dataclass
class TrainerOutput:
    """What any `TrainerLike.train_and_export()` implementation must
    produce — the real one (Ultralytics) and any fake used in tests
    both return this shape.
    """

    onnx_path: Path
    metrics: dict[str, Any]
    test_predictions: dict[str, list[Detection]]
    input_size: int
    num_classes: int


class TrainerLike(Protocol):
    def train_and_export(
        self,
        train_images_dir: Path,
        train_annotations: dict[str, list[Detection]],
        test_images_dir: Path,
        hyperparameters: dict[str, Any],
        output_dir: Path,
    ) -> TrainerOutput: ...


@dataclass
class TrainingResult:
    onnx_path: Path
    input_size: int
    num_classes: int
    metrics: dict[str, Any]
    evaluation_report: dict[str, Any]


def _default_trainer() -> TrainerLike:
    from vision_service.training._ultralytics_trainer import UltralyticsTrainer

    return UltralyticsTrainer()


def run_training_pipeline(
    *,
    train_images_dir: Path,
    train_annotations: dict[str, list[Detection]],
    test_images_dir: Path,
    test_annotations: dict[str, list[Detection]],
    hyperparameters: dict[str, Any],
    output_dir: Path,
    failure_notes: list[str] | None = None,
    trainer: TrainerLike | None = None,
) -> TrainingResult:
    """REQ-8.6: trains, exports to ONNX, and (REQ-8.8) evaluates against
    the test split — a pure orchestration function; every side effect
    (actually training a model, writing files) lives behind `trainer`.
    """
    active_trainer = trainer or _default_trainer()
    output = active_trainer.train_and_export(
        train_images_dir, train_annotations, test_images_dir, hyperparameters, output_dir
    )

    report = evaluate(
        output.test_predictions, test_annotations, failure_notes=failure_notes
    )

    return TrainingResult(
        onnx_path=output.onnx_path,
        input_size=output.input_size,
        num_classes=output.num_classes,
        metrics=output.metrics,
        evaluation_report=report,
    )


def publish_training_run(
    result: TrainingResult,
    *,
    dataset_id: str,
    dataset_split_id: str,
    hyperparameters: dict[str, Any],
    started_at: str,
    completed_at: str,
    git_commit: str | None = None,
    minio_client: MinioClient | None = None,
) -> dict[str, Any]:
    """REQ-8.7/8.9: uploads the exported `.onnx` to the models bucket,
    reports the run to `apps/api`'s experiment tracker, and — only if
    the run is reported as COMPLETED — registers the artifact in the
    model registry. Returns the model-registry response (or, if
    `evaluation_report` indicates the run should be marked FAILED
    upstream, the training-run response only — see the `status`
    parameter on the wire payload).

    Uploading before reporting (rather than the reverse) means a
    training-run record is never created pointing at an object that
    doesn't exist yet in the models bucket.
    """
    client = minio_client or MinioClient(bucket=settings.minio_models_bucket)
    object_key = f"{dataset_id}/{result.onnx_path.name}"
    client.upload_from(str(result.onnx_path), object_key)

    run_response = registry_client.report_training_run(
        {
            "datasetId": dataset_id,
            "datasetSplitId": dataset_split_id,
            "gitCommit": git_commit,
            "hyperparameters": hyperparameters,
            "status": "COMPLETED",
            "metrics": result.metrics,
            "evaluationReport": result.evaluation_report,
            "startedAt": started_at,
            "completedAt": completed_at,
        }
    )

    model_response = registry_client.register_model(
        {"trainingRunId": run_response["id"], "objectKey": object_key}
    )
    return model_response
