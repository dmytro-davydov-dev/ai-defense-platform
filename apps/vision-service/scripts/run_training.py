"""PRD-Phase-8 (docs/mvp-plan/PRD-Phase-8.md) REQ-8.6/8.7/8.9: CLI entry
point for a Phase 8 training run — a batch job, not a deployed service,
per `scripts/generate_samples.py`'s existing precedent for this
directory. Requires a dataset and split already registered via
`apps/api`'s `POST /datasets`/`POST /datasets/:id/splits` (REQ-8.1/8.3)
— this script only trains, evaluates, and publishes the result.

Real end-to-end use requires `ultralytics`/`torch` installed (this
sandbox could not install or verify them — see
docs/roadmap/Progress.md's Phase 8 Known gaps) and a running
`apps/api`/MinIO stack reachable via
`VISION_SERVICE_MODEL_REGISTRY_BASE_URL`.

Usage:
    uv run python scripts/run_training.py \\
        --dataset-id <uuid> --dataset-split-id <uuid> \\
        --train-images-dir ./data/train/images \\
        --train-annotations ./data/train/annotations.json \\
        --test-images-dir ./data/test/images \\
        --test-annotations ./data/test/annotations.json \\
        --epochs 50 --batch-size 16
"""

from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from vision_service.training.coco import parse_coco_annotations
from vision_service.training.train import publish_training_run, run_training_pipeline


def _git_commit() -> str | None:
    try:
        result = subprocess.run(  # fixed argv, no shell, no user-controlled input
            ["git", "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-id", required=True)
    parser.add_argument("--dataset-split-id", required=True)
    parser.add_argument("--train-images-dir", required=True, type=Path)
    parser.add_argument("--train-annotations", required=True, type=Path)
    parser.add_argument("--test-images-dir", required=True, type=Path)
    parser.add_argument("--test-annotations", required=True, type=Path)
    parser.add_argument("--output-dir", default=Path("./training-output"), type=Path)
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--base-model", default="yolov8n.pt")
    parser.add_argument(
        "--failure-note",
        action="append",
        default=[],
        help="REQ-8.14: a human-written failure-case note. Repeatable.",
    )
    args = parser.parse_args()

    train_annotations = parse_coco_annotations(
        json.loads(args.train_annotations.read_text())
    )
    test_annotations = parse_coco_annotations(json.loads(args.test_annotations.read_text()))

    hyperparameters = {
        "epochs": args.epochs,
        "batchSize": args.batch_size,
        "baseModel": args.base_model,
    }

    started_at = datetime.now(timezone.utc).isoformat()
    result = run_training_pipeline(
        train_images_dir=args.train_images_dir,
        train_annotations=train_annotations,
        test_images_dir=args.test_images_dir,
        test_annotations=test_annotations,
        hyperparameters=hyperparameters,
        output_dir=args.output_dir,
        failure_notes=args.failure_note,
    )
    completed_at = datetime.now(timezone.utc).isoformat()

    print(  # CLI script output, not a logged service
        f"training complete: mAP={result.evaluation_report['meanAveragePrecision']:.3f}, "
        f"flagged classes={result.evaluation_report['flaggedClasses']}"
    )

    model_response = publish_training_run(
        result,
        dataset_id=args.dataset_id,
        dataset_split_id=args.dataset_split_id,
        hyperparameters=hyperparameters,
        started_at=started_at,
        completed_at=completed_at,
        git_commit=_git_commit(),
    )
    print(f"registered model version {model_response['id']} (stage={model_response['stage']})")


if __name__ == "__main__":
    main()
