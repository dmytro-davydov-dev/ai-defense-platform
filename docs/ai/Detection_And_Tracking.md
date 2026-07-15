---
title: Detection and Tracking
type: ai
tags: [ai, phase5]
status: accepted
---

# Detection and Tracking

Phase 5 (`docs/mvp-plan/PRD-Phase-5.md`, REQ-5.1-5.12) is the first
grounded content under `docs/ai/` — Phases 1-4 had nothing here to
document (no detection logic existed yet). Model, adapter, and tracker
decisions are recorded in
[[ADR-006-detection-model-and-tracker]]; this note is the shorter,
domain-level summary of what actually runs, in
`apps/vision-service`'s `src/vision_service/detection/` package. Full
module-by-module detail lives in [[Vision_Service_Shell]]'s Phase 5
section — this note is the entry point, not a duplicate.

## Pipeline, in order

1. **Detect** — `detection.adapter.DetectorAdapterLike.detect(frame)`
   returns raw, unfiltered detections for one decoded frame.
   `detection.onnx_detector.OnnxDetectorAdapter` is the real
   implementation (YOLOv8n, ONNX Runtime, CPU-only); `detection.adapter.NullDetectorAdapter`
   is the zero-detection fallback used when no model is configured.
2. **Filter** — `detection.filters.filter_detections()` drops anything
   below the configurable confidence threshold
   (`VISION_SERVICE_DETECTION_CONFIDENCE_THRESHOLD`, default `0.35`)
   or outside `detection.classes.ALLOWED_CLASSES` — the platform's
   safety boundary, enforced here regardless of which model produced
   the detection.
3. **Track** — `detection.tracker.Tracker` (one instance per mission)
   assigns a stable `trackId` via per-label greedy IoU matching,
   ageing out unmatched tracks after a bounded number of missed
   frames.
4. **Annotate and publish** — `detection.pipeline.run_detection_pipeline()`
   draws each retained, tracked detection onto its frame
   (`annotation.draw.draw_detections`), writes the annotated video, and
   returns every detection as a `DetectionEvent`.
   `kafka.commands_consumer.handle_command_message` publishes one
   `DETECTION_PUBLISHED` event per `DetectionEvent` to
   `aidefense.detections` (mission ID as the partition key), then
   uploads the annotated video to MinIO
   (`missions/{missionId}/annotated.mp4`) before publishing
   `PROCESSING_COMPLETED` with `detectionCount`/`trackCount`/
   `annotatedVideoObjectKey`.

## Safety boundary

`detection.classes.ALLOWED_CLASSES` is a 12-class subset of COCO-80
(person, bicycle, car, motorcycle, bus, truck, boat, backpack,
suitcase, traffic light, fire hydrant, stop sign) — civilian/synthetic
categories only, per the roadmap's Phase 5 constraint and the
platform's permanent safety boundary (`README.md`). It is a plain code
constant, not a runtime/environment setting, so no deployment
configuration can silently widen it. COCO-80 itself has no weapon,
munitions, or targeting-relevant class to begin with, which makes this
allow-list a second, independent layer rather than the platform's only
defense — see [[ADR-006-detection-model-and-tracker]]'s Context.

## What's not real yet

No trained `.onnx` model file exists in this repository or has been
run through `OnnxDetectorAdapter` in this sandbox — `VISION_SERVICE_DETECTION_MODEL_PATH`
is unset, so `detection.factory.detector` resolves to
`NullDetectorAdapter` everywhere this has been verified so far. The
full pipeline's logic (filtering, tracking, annotation, event
publishing) is real, tested code, exercised via scripted/fake
detectors (`tests/test_detection_pipeline.py`); a real model's output
distribution has never been observed by this code. See
[[Vision_Service_Shell]]'s Phase 5 Known gap for detail.

[[PRD-Phase-8]] (Data, Training and Model Lifecycle) adds the tooling
that would produce and govern a real model — a dataset registry,
annotation import, a training pipeline, a model registry, and audited
promotion/rollback ([[ADR-008-experiment-tracking-and-dataset-versioning]],
[[ADR-009-annotation-format]]) — but does not itself close this gap:
`ultralytics`/`torch` could not be installed in this sandbox either
(same class of network restriction as every prior phase's `uv sync`/
`prisma generate` issues), so no training run has actually been
executed here, and `detection.factory`'s new registry-resolution path
(REQ-8.10) has only ever resolved to "no model in production yet" in
this environment. What changed: `detection.factory.build_detector()`
now also asks the model registry for a production model before falling
back to `NullDetectorAdapter`, so once a real model is trained and
promoted on a normal dev machine, a restarted `vision-service` picks it
up with no code change — see `detection/factory.py`'s module docstring
and [[PRD-Phase-8]] REQ-8.10.

------------------------------------------------------------------------

## Related Notes

- [[PRD-Phase-5]] — the requirements this note documents the implementation of.
- [[ADR-006-detection-model-and-tracker]] — the model/adapter/tracker decision record.
- [[Vision_Service_Shell]] — full module-by-module detail.
- [[PRD-Phase-4]] — the frame-iteration/annotation substrate this phase plugs into.
- [[Technology_Decisions]] — YOLO/ONNX Runtime as platform-wide accepted choices.
- [[PRD-Phase-8]] — dataset/training/model-lifecycle tooling that would produce a real model for this adapter.
- [[ADR-008-experiment-tracking-and-dataset-versioning]] — Phase 8's tracking/versioning tooling decision.
- [[ADR-009-annotation-format]] — Phase 8's annotation format decision.
