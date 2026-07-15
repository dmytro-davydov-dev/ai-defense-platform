"""PRD-Phase-8 (docs/mvp-plan/PRD-Phase-8.md) REQ-8.4/8.5: COCO JSON
import/export, converting to/from the platform's existing `Detection`/
`BoundingBox` contracts (`frames/models.py`) — the annotation format
decision is docs/adr/ADR-009-annotation-format.md.

Deliberately hand-rolled against the standard library `json` module,
not `pycocotools` — see ADR-009's Context for why (a native-build
Cython extension this sandbox's network restrictions make unreliable to
install, the same class of risk ADR-006 already flagged for
ByteTrack/BoT-SORT). This module only reads/writes the bounding-box
subset of COCO JSON (`images`/`annotations`/`categories`); segmentation
masks, keypoints, and other COCO extensions are ignored on import and
never produced on export.
"""

from __future__ import annotations

from typing import Any

from vision_service.detection.classes import ALLOWED_CLASSES
from vision_service.frames.models import BoundingBox, Detection

# REQ-8.5: ground-truth annotations carry no model confidence score —
# `Detection.confidence` requires a value in [0, 1], so imported
# ground-truth boxes are stamped at full confidence. This is a labeling
# convention, not a claim that annotations are infallible; nothing
# downstream (evaluate.py) treats this value as anything other than "this
# is ground truth, not a prediction."
GROUND_TRUTH_CONFIDENCE = 1.0

# A conservative pixel tolerance for a bounding box that lands exactly
# on (or a hair past, due to floating-point export rounding) an image's
# edge — real annotation tools sometimes emit e.g. x + width = 640.0001
# for a 640px-wide image.
BOUNDS_EPSILON = 1e-3


class CocoValidationError(Exception):
    """REQ-8.5: malformed COCO JSON, an out-of-bounds box, or a
    category outside `ALLOWED_CLASSES` — raised instead of silently
    dropping or reinterpreting the offending annotation.
    """


def parse_coco_annotations(
    coco_json: dict[str, Any],
) -> dict[str, list[Detection]]:
    """Returns ground-truth detections grouped by image file name
    (`images[].file_name`), each `Detection.boundingBox` in absolute
    pixel coordinates — the same convention `annotation.draw` and a real
    detector adapter's output already use, so training/evaluation code
    can treat "ground truth" and "prediction" uniformly.

    Raises `CocoValidationError` on any malformed structure, any
    category not in `ALLOWED_CLASSES` (REQ-8.5's safety-boundary gate
    on training data), or any bounding box outside its image's bounds.
    """
    _require_keys(coco_json, ("images", "annotations", "categories"), "top-level")

    images_by_id = _index_images(coco_json["images"])
    categories_by_id = _index_categories(coco_json["categories"])

    detections_by_file: dict[str, list[Detection]] = {
        image["file_name"]: [] for image in images_by_id.values()
    }

    for index, annotation in enumerate(coco_json["annotations"]):
        _require_keys(
            annotation, ("image_id", "category_id", "bbox"), f"annotations[{index}]"
        )
        image_id = annotation["image_id"]
        image = images_by_id.get(image_id)
        if image is None:
            raise CocoValidationError(
                f"annotations[{index}] references unknown image_id {image_id!r}"
            )

        category_id = annotation["category_id"]
        category_name = categories_by_id.get(category_id)
        if category_name is None:
            raise CocoValidationError(
                f"annotations[{index}] references unknown category_id {category_id!r}"
            )
        if category_name not in ALLOWED_CLASSES:
            raise CocoValidationError(
                f"annotations[{index}] has category {category_name!r}, which is outside "
                "detection.classes.ALLOWED_CLASSES — this platform's safety boundary "
                "applies to training data, not only to inference output (REQ-8.5)"
            )

        bbox = annotation["bbox"]
        if not (isinstance(bbox, list | tuple) and len(bbox) == 4):
            raise CocoValidationError(
                f"annotations[{index}].bbox must be a 4-element [x, y, width, height] array"
            )
        x, y, width, height = (float(value) for value in bbox)
        _validate_bounds(x, y, width, height, image["width"], image["height"], index)

        detections_by_file[image["file_name"]].append(
            Detection(
                label=category_name,
                confidence=GROUND_TRUTH_CONFIDENCE,
                boundingBox=BoundingBox(x=x, y=y, width=width, height=height),
            )
        )

    return detections_by_file


def write_coco_annotations(
    images: dict[str, tuple[int, int]],
    detections_by_file: dict[str, list[Detection]],
) -> dict[str, Any]:
    """Reverse direction, for round-tripping/debugging (ADR-009). `images`
    maps file name -> `(width, height)`. Every category name across
    `detections_by_file` becomes one `categories` entry — output is
    always a subset of `ALLOWED_CLASSES` if the input `Detection`s came
    from `parse_coco_annotations` or a real detector's filtered output,
    but this function does not itself re-validate that (call sites that
    need the safety-boundary guarantee should validate on import, not
    on export).
    """
    file_names = sorted(images.keys())
    image_id_by_file = {file_name: index + 1 for index, file_name in enumerate(file_names)}

    labels = sorted(
        {
            detection.label
            for detections in detections_by_file.values()
            for detection in detections
        }
    )
    category_id_by_label = {label: index + 1 for index, label in enumerate(labels)}

    coco_images = [
        {
            "id": image_id_by_file[file_name],
            "file_name": file_name,
            "width": images[file_name][0],
            "height": images[file_name][1],
        }
        for file_name in file_names
    ]
    coco_categories = [
        {"id": category_id, "name": label}
        for label, category_id in category_id_by_label.items()
    ]
    coco_annotations = []
    annotation_id = 1
    for file_name in file_names:
        for detection in detections_by_file.get(file_name, []):
            box = detection.boundingBox
            coco_annotations.append(
                {
                    "id": annotation_id,
                    "image_id": image_id_by_file[file_name],
                    "category_id": category_id_by_label[detection.label],
                    "bbox": [box.x, box.y, box.width, box.height],
                }
            )
            annotation_id += 1

    return {
        "images": coco_images,
        "annotations": coco_annotations,
        "categories": coco_categories,
    }


def _require_keys(obj: dict[str, Any], keys: tuple[str, ...], where: str) -> None:
    missing = [key for key in keys if key not in obj]
    if missing:
        raise CocoValidationError(f"{where} is missing required key(s): {missing}")


def _index_images(images: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
    indexed: dict[int, dict[str, Any]] = {}
    for position, image in enumerate(images):
        _require_keys(image, ("id", "file_name", "width", "height"), f"images[{position}]")
        indexed[image["id"]] = image
    return indexed


def _index_categories(categories: list[dict[str, Any]]) -> dict[int, str]:
    indexed: dict[int, str] = {}
    for position, category in enumerate(categories):
        _require_keys(category, ("id", "name"), f"categories[{position}]")
        indexed[category["id"]] = category["name"]
    return indexed


def _validate_bounds(
    x: float,
    y: float,
    width: float,
    height: float,
    image_width: float,
    image_height: float,
    annotation_index: int,
) -> None:
    if width <= 0 or height <= 0:
        raise CocoValidationError(
            f"annotations[{annotation_index}].bbox has non-positive width/height: "
            f"({width}, {height})"
        )
    if (
        x < -BOUNDS_EPSILON
        or y < -BOUNDS_EPSILON
        or x + width > image_width + BOUNDS_EPSILON
        or y + height > image_height + BOUNDS_EPSILON
    ):
        raise CocoValidationError(
            f"annotations[{annotation_index}].bbox [{x}, {y}, {width}, {height}] falls "
            f"outside its image's bounds ({image_width}x{image_height}) — this can indicate "
            "normalized [0,1] coordinates were exported under the same field name (REQ-8.5)"
        )
