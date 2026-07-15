---
title: "ADR-009: Annotation Format"
type: adr
tags: [adr, phase8, mlops]
status: accepted
---

# ADR-009: Annotation Format

- Status: Accepted
- Date: 2026-07-15
- Decision owners: Dmytro
- Related documents: [[PRD-Phase-8]], [[ADR-006-detection-model-and-tracker]], [[Technology_Decisions]], [[Coding_Standards]], [[Repository_Structure]]

## Context

[[PRD-Phase-8]] Section 7 requires this ADR to settle which standard
bounding-box annotation format REQ-8.4's import/export utility targets,
before that utility is implemented (Section 6 step 6). The platform
does not build a custom annotation UI (Non-goals, Section 4) — operators
label data in an existing open-source tool and this platform only needs
to ingest and validate the result.

## Decision

**COCO JSON** (the `instances_*.json` object-detection format
popularized by the COCO dataset and widely exportable from open-source
annotation tools — CVAT, Roboflow, LabelImg, and others all support it
natively). REQ-8.4's conversion utility
(`apps/vision-service/src/vision_service/training/coco.py`) reads a
COCO JSON file's `images`/`annotations`/`categories` sections and
produces the platform's existing `Detection`/`BoundingBox` Pydantic
contracts (`frames/models.py`), and can write the reverse direction for
round-tripping/debugging.

The parser is hand-rolled against Python's standard `json` module —
`pycocotools` (the reference COCO Python package) is deliberately **not**
added as a dependency: it ships a Cython extension
(`pycocotools/_mask`) requiring a native build step, the same class of
native-build-dependency risk [[ADR-006-detection-model-and-tracker]]'s
"Alternative C" already rejected for `ByteTrack`/`BoT-SORT` in this
sandbox. This phase only needs to read `bbox`/`category_id`/`image_id`
fields out of a JSON document and validate them — a small, fully
stdlib-based parser covers that without pulling in `pycocotools`' mask
RLE/polygon tooling this platform has no use for (segmentation masks are
out of scope; only bounding boxes are).

Class-name resolution uses COCO JSON's own `categories` array
(`{id, name}` pairs) mapped against
`detection.classes.ALLOWED_CLASSES` — an annotation whose category name
doesn't match names in `detection.classes.COCO_CLASSES`/isn't in
`ALLOWED_CLASSES` is rejected (REQ-8.5), not silently dropped or
renamed.

## Alternatives considered

### Alternative A — COCO JSON, as decided

Most widely supported export format among open-source annotation
tools; a bounding-box-only subset is small enough to parse by hand
without `pycocotools`. Chosen.

### Alternative B — Pascal VOC XML

Also widely supported (LabelImg's original native format), one XML file
per image rather than one JSON file per dataset. Rejected: no
meaningful advantage over COCO JSON for this platform's purposes, and
per-image files would complicate the "one manifest describes the whole
dataset" shape REQ-8.3's split-generation step already assumes.

### Alternative C — YOLO's own `.txt`-per-image label format

The most natural fit with the training pipeline's own YOLO/Ultralytics
tooling (REQ-8.6), since Ultralytics can consume it with zero
conversion. Rejected as the *interchange* format specifically because
it carries no class-name mapping of its own (labels are bare integer
indices, with the name mapping living in a separate `data.yaml` a human
must keep in sync) and is less consistently exported by general-purpose
annotation tools than COCO JSON. Not wasted, however: REQ-8.6's training
step still converts the ingested COCO JSON into YOLO's per-image `.txt`
layout internally, immediately before invoking Ultralytics — that
conversion is trivial once annotations are already validated
`Detection` objects, and is the training pipeline's concern
(Section 6 step 7), not this ADR's.

## Consequences

### Positive

- No new native-build dependency (`pycocotools` avoided) — consistent
  with this sandbox's repeatedly-documented native-build-install risk.
- One format for the whole dataset (not one file per image) matches
  REQ-8.3's split-generation step, which needs to enumerate and shuffle
  a dataset's full item list.
- Reuses the exact `Detection`/`BoundingBox` contracts Phase 5 already
  defined — annotation import produces the same shape a real detector
  adapter's output would, so the same downstream code (evaluation
  report generation, REQ-8.8) can treat "ground truth" and "prediction"
  uniformly.

### Negative

- The hand-rolled parser supports only what this phase needs (bounding
  boxes, category names) — segmentation masks, keypoints, or other COCO
  JSON extensions in a real annotation export are ignored, not
  preserved. Acceptable: this platform's detector adapter interface
  (REQ-5.1) is bounding-box-only to begin with.
- A user exporting from a tool with a nonstandard COCO JSON variant
  (missing fields, different id conventions) may hit a validation error
  this hand-rolled parser wasn't written to anticipate. Mitigated by
  REQ-8.5's requirement that malformed input be rejected with a clear
  error, not silently misinterpreted.

### Risks

- COCO JSON's `bbox` field is `[x, y, width, height]` in absolute pixel
  coordinates by convention, but not every export tool is equally
  careful about this — a tool exporting normalized `[0, 1]` coordinates
  under the same field name would silently produce wrong boxes. Mitigate
  by validating that every parsed box falls within `[0, image_width]` /
  `[0, image_height]` (REQ-8.5), which a normalized-coordinate export
  would fail loudly rather than pass silently.

## Migration and rollback

No migration — new functionality. Rollback is not applicable; if a
different format is needed later, only `training/coco.py`'s conversion
functions need replacing, since every downstream consumer (split
generation, training, evaluation) operates on the platform's own
`Detection`/`BoundingBox` contracts, not on COCO JSON directly.

## Review date

Revisit if: an annotation tool in actual use exports a format other
than COCO JSON with no COCO-export option; segmentation masks or
keypoints become a real platform requirement; or `pycocotools`
specifically becomes necessary for a capability this hand-rolled parser
can't reasonably cover.

---

## Related Notes

- [[PRD-Phase-8]] — the requirements this ADR resolves Section 7 for.
- [[ADR-006-detection-model-and-tracker]] — the `Detection`/`BoundingBox` contracts this format converts to/from, and the native-build-dependency reasoning this ADR reuses.
- [[Technology_Decisions]] — OpenCV/YOLO as the platform's accepted CV stack.
- [[Coding_Standards]] — ADR trigger and Python conventions this decision follows.
- [[ADR-008-experiment-tracking-and-dataset-versioning]] — the companion ADR for Phase 8's tracking/versioning tooling.
