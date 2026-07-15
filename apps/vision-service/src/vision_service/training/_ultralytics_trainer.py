"""PRD-Phase-8 (docs/mvp-plan/PRD-Phase-8.md) REQ-8.6: the real
Ultralytics-YOLO-backed `TrainerLike` implementation. Imported lazily,
only from `train.py`'s `_default_trainer()` — this module is the one
place in Phase 8 that actually requires `ultralytics`/`torch` to be
installed, per that function's docstring. Never run end-to-end in this
sandbox (see docs/roadmap/Progress.md's Phase 8 Known gaps): `ultralytics`
could not be installed here (network-restricted, same class of gap as
every prior phase's `uv sync`/`prisma generate` issues), so this file is
reviewed, not executed, the same posture Phase 5 documented for a real
`.onnx` model never having been run through `OnnxDetectorAdapter`.

Converts the platform's `Detection`/`BoundingBox` ground truth (already
parsed from COCO JSON by `training.coco.parse_coco_annotations`) into
YOLO's own per-image `.txt` label format — the interchange format
decision (docs/adr/ADR-009-annotation-format.md) explicitly keeps this
conversion internal to the training step, not the ingestion format.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from vision_service.detection.classes import ALLOWED_CLASSES, COCO_CLASSES
from vision_service.frames.models import Detection
from vision_service.settings import settings
from vision_service.training.train import TrainerOutput

# REQ-8.6: only classes in this platform's safety allow-list are ever
# written into a YOLO label file — training on a class outside
# ALLOWED_CLASSES would defeat the entire point of REQ-8.5's import-time
# gate. Sorted for a stable, reviewable class-index mapping across runs.
_TRAINABLE_CLASSES = sorted(ALLOWED_CLASSES)


def _class_index(label: str) -> int:
    return _TRAINABLE_CLASSES.index(label)


def _write_yolo_labels(
    images_dir: Path,
    annotations_by_file: dict[str, list[Detection]],
    labels_dir: Path,
    image_sizes: dict[str, tuple[int, int]],
) -> None:
    """One `.txt` per image, YOLO format: `class_id cx cy w h`, all
    normalized to `[0, 1]` by the image's own width/height — Ultralytics'
    required label convention, distinct from this platform's own
    top-left-pixel `BoundingBox` convention used everywhere else.
    """
    labels_dir.mkdir(parents=True, exist_ok=True)
    for file_name, detections in annotations_by_file.items():
        width, height = image_sizes[file_name]
        stem = Path(file_name).stem
        lines = []
        for detection in detections:
            if detection.label not in _TRAINABLE_CLASSES:
                # REQ-8.5 already rejected this at import time;
                # defensive, not reachable in practice.
                continue
            box = detection.boundingBox
            cx = (box.x + box.width / 2) / width
            cy = (box.y + box.height / 2) / height
            w = box.width / width
            h = box.height / height
            lines.append(f"{_class_index(detection.label)} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}")
        (labels_dir / f"{stem}.txt").write_text("\n".join(lines))


def _write_data_yaml(train_images_dir: Path, test_images_dir: Path, output_dir: Path) -> Path:
    data_yaml_path = output_dir / "data.yaml"
    class_names = "\n".join(f"  {i}: {name}" for i, name in enumerate(_TRAINABLE_CLASSES))
    data_yaml_path.write_text(
        f"train: {train_images_dir}\nval: {test_images_dir}\nnames:\n{class_names}\n"
    )
    return data_yaml_path


class UltralyticsTrainer:
    def train_and_export(
        self,
        train_images_dir: Path,
        train_annotations: dict[str, list[Detection]],
        test_images_dir: Path,
        hyperparameters: dict[str, Any],
        output_dir: Path,
    ) -> TrainerOutput:
        from ultralytics import YOLO  # deferred: see module docstring

        output_dir.mkdir(parents=True, exist_ok=True)
        image_sizes = _read_image_sizes(train_images_dir)
        _write_yolo_labels(
            train_images_dir, train_annotations, output_dir / "labels" / "train", image_sizes
        )
        data_yaml_path = _write_data_yaml(train_images_dir, test_images_dir, output_dir)

        model = YOLO(hyperparameters.get("baseModel", "yolov8n.pt"))
        model.train(
            data=str(data_yaml_path),
            epochs=hyperparameters.get("epochs", 50),
            imgsz=settings.detection_input_size,
            batch=hyperparameters.get("batchSize", 16),
            project=str(output_dir),
            name="train",
            verbose=False,
        )
        # ADR-006's export convention (opset >= 12, static square input,
        # standard Ultralytics (1, 4+num_classes, num_boxes) output) is
        # Ultralytics' own default ONNX export shape — no extra flags
        # needed beyond imgsz/opset to match `onnx_detector.py`'s
        # postprocessing assumptions.
        exported_path = Path(
            model.export(format="onnx", opset=12, imgsz=settings.detection_input_size)
        )

        test_predictions = _predict_directory(model, test_images_dir)

        metrics = {"epochsRun": hyperparameters.get("epochs", 50)}
        return TrainerOutput(
            onnx_path=exported_path,
            metrics=metrics,
            test_predictions=test_predictions,
            input_size=settings.detection_input_size,
            num_classes=len(COCO_CLASSES),
        )


def _read_image_sizes(images_dir: Path) -> dict[str, tuple[int, int]]:
    import cv2

    sizes: dict[str, tuple[int, int]] = {}
    for image_path in sorted(images_dir.iterdir()):
        image = cv2.imread(str(image_path))
        if image is None:
            continue
        height, width = image.shape[:2]
        sizes[image_path.name] = (width, height)
    return sizes


def _predict_directory(model: Any, images_dir: Path) -> dict[str, list[Detection]]:
    from vision_service.frames.models import BoundingBox

    predictions: dict[str, list[Detection]] = {}
    for image_path in sorted(images_dir.iterdir()):
        results = model.predict(str(image_path), verbose=False)
        detections: list[Detection] = []
        for result in results:
            for box in result.boxes:
                class_id = int(box.cls[0])
                if class_id >= len(_TRAINABLE_CLASSES):
                    continue
                x1, y1, x2, y2 = (float(v) for v in box.xyxy[0])
                detections.append(
                    Detection(
                        label=_TRAINABLE_CLASSES[class_id],
                        confidence=float(box.conf[0]),
                        boundingBox=BoundingBox(x=x1, y=y1, width=x2 - x1, height=y2 - y1),
                    )
                )
        predictions[image_path.name] = detections
    return predictions
