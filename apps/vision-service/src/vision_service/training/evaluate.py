"""PRD-Phase-8 (docs/mvp-plan/PRD-Phase-8.md) REQ-8.8/8.13/8.14:
per-class precision/recall/average-precision against a held-out test
split, a flagged-low-performer section (REQ-8.13), and pass-through
support for human-written failure notes (REQ-8.14) — this module never
infers failure notes itself, per this phase's Non-goals ("this phase
does not implement automated bias-detection algorithms").

Returns a plain `dict` with the exact camelCase keys
`apps/api`'s `EvaluationReportDto` expects (mirroring
`events/*.py`/`frames/models.py`'s existing "this is a wire contract"
convention), ready to serialize straight into
`registry_client.report_training_run()`'s request body with no
translation step.

Average precision here is a straightforward rectangle-rule
precision-recall-curve integral (sorted by confidence, cumulative
TP/FP), not COCO's exact 101-point interpolation — a documented
simplification appropriate for this reference implementation's scope,
the same kind of deliberate simplification
docs/adr/ADR-006-detection-model-and-tracker.md made for its in-house
tracker instead of ByteTrack/BoT-SORT.
"""

from __future__ import annotations

from typing import Any

from vision_service.frames.models import BoundingBox, Detection

IOU_MATCH_THRESHOLD = 0.5

# REQ-8.13: a class flagged if its AP falls more than this fraction
# below the dataset's mean AP — e.g. 0.2 means "20% relatively below
# the mean."
FLAG_RELATIVE_DROP = 0.2


def compute_iou(a: BoundingBox, b: BoundingBox) -> float:
    """Standard axis-aligned intersection-over-union. Top-left `(x, y)` +
    `width`/`height` convention, same as `annotation.draw`/`onnx_detector`.
    """
    a_x2, a_y2 = a.x + a.width, a.y + a.height
    b_x2, b_y2 = b.x + b.width, b.y + b.height

    inter_x1 = max(a.x, b.x)
    inter_y1 = max(a.y, b.y)
    inter_x2 = min(a_x2, b_x2)
    inter_y2 = min(a_y2, b_y2)

    inter_width = max(0.0, inter_x2 - inter_x1)
    inter_height = max(0.0, inter_y2 - inter_y1)
    intersection = inter_width * inter_height

    union = (a.width * a.height) + (b.width * b.height) - intersection
    if union <= 0:
        return 0.0
    return intersection / union


def _match_and_score(
    predictions: list[tuple[str, Detection]],
    ground_truth_by_file: dict[str, list[Detection]],
    label: str,
    iou_threshold: float,
) -> tuple[float, float, float, int]:
    """Returns `(precision, recall, average_precision, support_count)`
    for one class label, across all files.
    """
    support_count = sum(
        1 for detections in ground_truth_by_file.values() for d in detections if d.label == label
    )
    class_predictions = sorted(
        (item for item in predictions if item[1].label == label),
        key=lambda item: item[1].confidence,
        reverse=True,
    )

    if support_count == 0 or not class_predictions:
        return (0.0, 0.0, 0.0, support_count)

    matched_gt: dict[str, set[int]] = {file_name: set() for file_name in ground_truth_by_file}
    true_positives: list[int] = []
    false_positives: list[int] = []

    for file_name, prediction in class_predictions:
        candidates = ground_truth_by_file.get(file_name, [])
        best_iou = 0.0
        best_index = -1
        for gt_index, gt in enumerate(candidates):
            if gt.label != label or gt_index in matched_gt.get(file_name, set()):
                continue
            iou = compute_iou(prediction.boundingBox, gt.boundingBox)
            if iou > best_iou:
                best_iou = iou
                best_index = gt_index

        if best_index >= 0 and best_iou >= iou_threshold:
            matched_gt.setdefault(file_name, set()).add(best_index)
            true_positives.append(1)
            false_positives.append(0)
        else:
            true_positives.append(0)
            false_positives.append(1)

    cumulative_tp = 0
    cumulative_fp = 0
    precisions: list[float] = []
    recalls: list[float] = []
    for tp, fp in zip(true_positives, false_positives, strict=True):
        cumulative_tp += tp
        cumulative_fp += fp
        precisions.append(cumulative_tp / (cumulative_tp + cumulative_fp))
        recalls.append(cumulative_tp / support_count)

    average_precision = 0.0
    previous_recall = 0.0
    for precision, recall in zip(precisions, recalls, strict=True):
        average_precision += (recall - previous_recall) * precision
        previous_recall = recall

    final_precision = precisions[-1] if precisions else 0.0
    final_recall = recalls[-1] if recalls else 0.0
    return (final_precision, final_recall, average_precision, support_count)


def evaluate(
    predictions_by_file: dict[str, list[Detection]],
    ground_truth_by_file: dict[str, list[Detection]],
    *,
    failure_notes: list[str] | None = None,
    iou_threshold: float = IOU_MATCH_THRESHOLD,
) -> dict[str, Any]:
    """REQ-8.8: per-class precision/recall/AP against `ground_truth_by_file`
    (e.g. parsed via `training.coco.parse_coco_annotations`).
    `failure_notes` (REQ-8.14) is human-supplied and passed through
    verbatim — this function never invents one.
    """
    predictions: list[tuple[str, Detection]] = [
        (file_name, detection)
        for file_name, detections in predictions_by_file.items()
        for detection in detections
    ]
    labels = sorted(
        {
            detection.label
            for detections in ground_truth_by_file.values()
            for detection in detections
        }
    )

    per_class: list[dict[str, Any]] = []
    for label in labels:
        precision, recall, average_precision, support_count = _match_and_score(
            predictions, ground_truth_by_file, label, iou_threshold
        )
        per_class.append(
            {
                "label": label,
                "precision": precision,
                "recall": recall,
                "averagePrecision": average_precision,
                "supportCount": support_count,
            }
        )

    scored_classes = [entry for entry in per_class if entry["supportCount"] > 0]
    mean_average_precision = (
        sum(entry["averagePrecision"] for entry in scored_classes) / len(scored_classes)
        if scored_classes
        else 0.0
    )

    # REQ-8.13: flagged, not silently averaged away — a class whose AP
    # sits materially below the mean is surfaced as its own report
    # section, per the risk register's "Show confidence, provenance and
    # review requirements" mitigation.
    flag_ceiling = mean_average_precision * (1 - FLAG_RELATIVE_DROP)
    flagged_classes = [
        entry["label"]
        for entry in scored_classes
        if entry["averagePrecision"] < flag_ceiling
    ]

    return {
        "meanAveragePrecision": mean_average_precision,
        "perClass": per_class,
        "flaggedClasses": flagged_classes,
        "failureNotes": list(failure_notes or []),
    }
