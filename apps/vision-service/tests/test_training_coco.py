"""REQ-8.4/8.5: COCO JSON import/export against `Detection`/`BoundingBox`."""

from __future__ import annotations

import pytest

from vision_service.training.coco import (
    CocoValidationError,
    parse_coco_annotations,
    write_coco_annotations,
)

VALID_COCO = {
    "images": [
        {"id": 1, "file_name": "frame-0001.jpg", "width": 640, "height": 480},
        {"id": 2, "file_name": "frame-0002.jpg", "width": 640, "height": 480},
    ],
    "categories": [
        {"id": 1, "name": "car"},
        {"id": 2, "name": "person"},
    ],
    "annotations": [
        {"id": 1, "image_id": 1, "category_id": 1, "bbox": [10, 20, 100, 50]},
        {"id": 2, "image_id": 1, "category_id": 2, "bbox": [200, 200, 30, 60]},
    ],
}


def test_parses_valid_coco_into_detections_grouped_by_file_name() -> None:
    result = parse_coco_annotations(VALID_COCO)

    assert set(result.keys()) == {"frame-0001.jpg", "frame-0002.jpg"}
    assert len(result["frame-0001.jpg"]) == 2
    assert result["frame-0002.jpg"] == []

    car = result["frame-0001.jpg"][0]
    assert car.label == "car"
    assert car.confidence == 1.0
    assert car.boundingBox.x == 10
    assert car.boundingBox.width == 100


def test_rejects_category_outside_allowed_classes() -> None:
    coco = {
        **VALID_COCO,
        "categories": [{"id": 1, "name": "knife"}],
        "annotations": [{"id": 1, "image_id": 1, "category_id": 1, "bbox": [0, 0, 10, 10]}],
    }
    with pytest.raises(CocoValidationError, match="ALLOWED_CLASSES"):
        parse_coco_annotations(coco)


def test_rejects_out_of_bounds_bbox() -> None:
    coco = {
        **VALID_COCO,
        "annotations": [{"id": 1, "image_id": 1, "category_id": 1, "bbox": [600, 400, 100, 100]}],
    }
    with pytest.raises(CocoValidationError, match="outside its image's bounds"):
        parse_coco_annotations(coco)


def test_rejects_non_positive_width_or_height() -> None:
    coco = {
        **VALID_COCO,
        "annotations": [{"id": 1, "image_id": 1, "category_id": 1, "bbox": [10, 10, 0, 10]}],
    }
    with pytest.raises(CocoValidationError, match="non-positive"):
        parse_coco_annotations(coco)


def test_rejects_unknown_image_id() -> None:
    coco = {
        **VALID_COCO,
        "annotations": [{"id": 1, "image_id": 999, "category_id": 1, "bbox": [0, 0, 10, 10]}],
    }
    with pytest.raises(CocoValidationError, match="unknown image_id"):
        parse_coco_annotations(coco)


def test_rejects_missing_required_keys() -> None:
    with pytest.raises(CocoValidationError, match="missing required key"):
        parse_coco_annotations({"images": [], "annotations": []})


def test_rejects_malformed_bbox_shape() -> None:
    coco = {
        **VALID_COCO,
        "annotations": [{"id": 1, "image_id": 1, "category_id": 1, "bbox": [0, 0, 10]}],
    }
    with pytest.raises(CocoValidationError, match="4-element"):
        parse_coco_annotations(coco)


def test_round_trips_through_write_and_parse() -> None:
    detections_by_file = parse_coco_annotations(VALID_COCO)
    images = {
        image["file_name"]: (image["width"], image["height"])
        for image in VALID_COCO["images"]
    }

    written = write_coco_annotations(images, detections_by_file)
    reparsed = parse_coco_annotations(written)

    assert len(reparsed["frame-0001.jpg"]) == len(detections_by_file["frame-0001.jpg"])
    labels = {detection.label for detection in reparsed["frame-0001.jpg"]}
    assert labels == {"car", "person"}
