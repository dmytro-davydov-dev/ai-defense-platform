"""REQ-5.4 and the model's native vocabulary (docs/adr/ADR-006-detection-model-and-tracker.md).

Two distinct lists, deliberately kept apart:

- `COCO_CLASSES`: the 80-class vocabulary `OnnxDetectorAdapter`'s
  postprocessing maps class indices against — this is what the model
  can possibly output, not what the platform allows through.
- `ALLOWED_CLASSES`: the safety-reviewed allow-list `filters.py`
  enforces before any detection is tracked, annotated, or published.
  Any class the model emits that is absent here is dropped, full stop.
"""

from __future__ import annotations

# Standard Ultralytics/COCO-80 class order — index position matters,
# it is exactly how OnnxDetectorAdapter maps a predicted class index to
# a label name. Do not reorder.
COCO_CLASSES: tuple[str, ...] = (
    "person",
    "bicycle",
    "car",
    "motorcycle",
    "airplane",
    "bus",
    "train",
    "truck",
    "boat",
    "traffic light",
    "fire hydrant",
    "stop sign",
    "parking meter",
    "bench",
    "bird",
    "cat",
    "dog",
    "horse",
    "sheep",
    "cow",
    "elephant",
    "bear",
    "zebra",
    "giraffe",
    "backpack",
    "umbrella",
    "handbag",
    "tie",
    "suitcase",
    "frisbee",
    "skis",
    "snowboard",
    "sports ball",
    "kite",
    "baseball bat",
    "baseball glove",
    "skateboard",
    "surfboard",
    "tennis racket",
    "bottle",
    "wine glass",
    "cup",
    "fork",
    "knife",
    "spoon",
    "bowl",
    "banana",
    "apple",
    "sandwich",
    "orange",
    "broccoli",
    "carrot",
    "hot dog",
    "pizza",
    "donut",
    "cake",
    "chair",
    "couch",
    "potted plant",
    "bed",
    "dining table",
    "toilet",
    "tv",
    "laptop",
    "mouse",
    "remote",
    "keyboard",
    "cell phone",
    "microwave",
    "oven",
    "toaster",
    "sink",
    "refrigerator",
    "book",
    "clock",
    "vase",
    "scissors",
    "teddy bear",
    "hair drier",
    "toothbrush",
)

# REQ-5.4: the platform-wide safety allow-list. Civilian/synthetic
# training categories only, per docs/mvp-plan/PRD-Phase-5.md's Section
# 4 non-goal ("expanding the object-class allow-list ... is a
# deliberate, separately reviewed decision, not a default of this
# phase") and the roadmap's Phase 5 safety constraint. Note that
# COCO-80 has no weapon, munitions, or targeting-relevant category to
# begin with (docs/adr/ADR-006-detection-model-and-tracker.md); this
# list is a second, independent safety layer on top of that, not the
# only one. `knife`/`scissors`/`baseball bat` are deliberately excluded
# even though COCO defines them as ordinary household/sporting objects
# — a conservative choice for a defense-oriented platform to avoid any
# ambiguous framing, not a technical necessity.
#
# NOT settings/env-configurable on purpose: this is a reviewable code
# constant, not a runtime knob an operator (or a misconfigured
# deployment) could silently widen.
ALLOWED_CLASSES: frozenset[str] = frozenset(
    {
        "person",
        "bicycle",
        "car",
        "motorcycle",
        "bus",
        "truck",
        "boat",
        "backpack",
        "suitcase",
        "traffic light",
        "fire hydrant",
        "stop sign",
    }
)
