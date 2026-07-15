---
title: "PRD — Phase 5: AI Detection and Tracking"
type: prd
tags: [mvp, prd, phase5]
status: draft
---

# PRD — Phase 5: AI Detection and Tracking

Version: 1.0
Status: Draft
Date: 2026-07-14
Owner: Dmytro
Related documents: [[MVP_Implementation_Plan]], [[AI_Defense_Platform_Roadmap]], [[PRD-Phase-4]], [[Vision_Service_Shell]], [[Technology_Decisions]], [[Coding_Standards]], [[Initial_Risk_Register]], [[Guiding_Principles]]

---

## 1. Summary

Phase 5 plugs real object detection and multi-object tracking into the
frame-iteration substrate Phase 4 built. `commands_consumer.py` today
downloads a mission's video, extracts metadata, and iterates every frame
"counting only — no model inference" ([[Vision_Service_Shell]]). This
phase replaces that counting loop with a detector adapter that runs a
YOLO model via ONNX Runtime, a tracker that assigns stable track IDs
across frames, and publishing of real `Detection` values to
`aidefense.detections` — the topic Phase 3 created but never populated.
It is the MVP's named "AI-based object detection and tracking" goal
(`docs/vision/Goals.md`), scoped from the start to civilian/synthetic
object classes only, per the roadmap's Phase 5 safety constraint.

## 2. Problem statement

`frames/models.py`'s `Detection` contract and `annotation/draw.py`'s
drawing utility have existed since Phase 4, but nothing populates or
calls them with real data — `Detection`'s fields exist and are
unit-tested against hand-built fixtures only
([[Vision_Service_Shell]], "What's deliberately not here yet").
`aidefense.detections` has been declared as a mission-scoped topic
since Phase 3 (REQ-3.1/3.2, `packages/event-schemas/src/topics.ts`) but
has no producer. `packages/event-schemas/src/payloads.ts` has no
detection-event payload type at all. Without this phase, Phase 6's
video player has nothing to overlay and Phase 7's map has no detection
points to render — both are named MVP goals that depend on this gap
closing.

## 3. Goals

- A detector adapter interface (input: a decoded `Frame`; output: a
  list of normalized `Detection` objects) so the underlying model is
  swappable without touching the consumer pipeline, per the Technology
  Independence guiding principle.
- A YOLO model exported/converted to ONNX and run through ONNX Runtime
  behind that adapter — CPU-only for this phase, consistent with Phase
  4's CPU-only OpenCV decoding; GPU/TensorRT optimization stays behind
  the same adapter for the edge phase (Phase 9) per
  [[Technology_Decisions]] and [[Initial_Risk_Register]]'s
  GPU-portability risk.
- A configurable confidence threshold and an explicit, small allow-list
  of civilian/synthetic object classes — detections outside the
  allow-list or below threshold are never published, never annotated,
  and never logged as detections.
- Multi-object tracking (ByteTrack or BoT-SORT) that assigns a stable
  track ID to a detection across consecutive frames and maintains
  per-mission track history.
- Real `Detection` events published to `aidefense.detections`, carrying
  bounding box, class label, confidence, track ID, and frame timestamp,
  following the same event envelope and correlation/causation
  conventions as every other Phase 3 event.
- An annotated output video (Phase 4's `annotation/draw.py`, now called
  with real detections) generated per mission and uploaded to MinIO as
  a mission artifact.
- Per-frame inference metrics (latency, throughput) captured in
  structured, correlation-ID-aware logs, ready for Phase 11's
  dashboards without requiring a dashboard to exist yet.
- Unit tests for the adapter, tracker integration, threshold, and
  class-filter logic, plus threshold-based evaluation fixtures (not
  exact-match, since model output is not guaranteed bit-identical
  across environments).

## 4. Non-goals (explicitly out of scope for Phase 5)

- Any dataset registry, annotation workflow, training pipeline,
  experiment tracking, or model promotion/rollback — that is Phase 8
  (Data, Training and Model Lifecycle).
- GPU-specific inference optimization (TensorRT) or any edge-runtime
  deployment of the model — that is Phase 9. This phase stays
  CPU-only ONNX Runtime, same as Phase 4 stayed CPU-only OpenCV.
- Rendering detection overlays or track history in a UI — Phase 6's
  video player consumes this phase's events and annotated video but is
  not built here.
- Mapping detections to geospatial coordinates or rendering them on a
  map — Phase 7.
- Any weapon guidance, target scoring, or autonomous engagement logic,
  under any circumstance, in this phase or any future one — an
  explicit, permanent platform-wide safety boundary
  (`README.md`'s "Safety and scope boundary", the roadmap's Phase 5
  safety constraint, [[Guiding_Principles]]).
- Expanding the object-class allow-list beyond civilian/synthetic
  training categories — any future expansion is a deliberate,
  separately reviewed decision, not a default of this phase.
- Fine-grained per-detection authorization or a `viewer`-only detection
  feed — RBAC stays the two flat roles from Phase 2 ([[Security_Baseline]]).

## 5. Requirements

### 5.1 Detector adapter interface

- REQ-5.1: A detector adapter interface (e.g. a `Protocol`/abstract
  base class) is defined in `apps/vision-service`: input is a decoded
  `Frame` (Phase 4, REQ-4.9), output is a list of normalized
  `Detection` objects. The Kafka consumer pipeline depends only on this
  interface, never on the ONNX/YOLO implementation directly, so a
  future model swap (Phase 8's model registry, a different
  architecture) does not require changing `commands_consumer.py`.

### 5.2 Model integration

- REQ-5.2: A YOLO model (e.g. YOLOv8n or YOLO11n, finalized via the
  ADR in Section 7) is exported/converted to ONNX and loaded through
  ONNX Runtime inside a concrete implementation of the REQ-5.1 adapter.
  Model file placement and provisioning follow
  [[Repository_Structure]]'s `models/` convention and its "datasets and
  model binaries are not committed unless explicitly licensed and
  small" rule — a large model is fetched at build/startup time instead
  of committed.

### 5.3 Confidence and class filtering

- REQ-5.3: The confidence threshold is configurable (environment
  variable, consistent with `settings.py`'s existing
  `VISION_SERVICE_*` pattern), applied after inference and before any
  detection is annotated, published, or logged.
- REQ-5.4: An explicit allow-list of object classes is enforced in the
  same filtering step — civilian/synthetic classes only. Any class
  outside the allow-list is dropped before it reaches the tracker,
  the annotation step, or `aidefense.detections`. This is the concrete
  enforcement mechanism for the roadmap's Phase 5 safety constraint and
  [[Initial_Risk_Register]]'s "public framing implies autonomous
  weapon capability" risk.

### 5.4 Multi-object tracking

- REQ-5.5: A tracker (ByteTrack or BoT-SORT, finalized via the Section
  7 ADR) consumes the filtered per-frame detections and assigns a
  stable track ID that persists across consecutive frames for the same
  object, maintaining track history for the duration of the mission's
  frame iteration.

### 5.5 Detection event publishing

- REQ-5.6: A `DETECTION_PUBLISHED` (or equivalently named) payload is
  added to `packages/event-schemas` (JSON Schema, generated TS type,
  mirrored Pydantic model, per Phase 3's REQ-3.3/3.4 three-way sync
  convention) carrying bounding box, class label, confidence, track ID,
  and frame timestamp. `commands_consumer.py` publishes one such event
  per retained detection to `aidefense.detections`, using the mission
  ID as the partition key (already declared mission-scoped in
  `topics.ts`'s `MISSION_SCOPED_TOPICS`) and propagating
  correlation/causation IDs per REQ-3.11/3.12.

### 5.6 Annotated video artifact

- REQ-5.7: Phase 4's `annotation/draw.py` is called with the real,
  filtered, tracked detections for each frame; the annotated frames are
  encoded into an output video and uploaded to MinIO as a mission
  artifact, following the same bucket/client conventions Phase 4's
  `storage/minio_client.py` established.

### 5.7 Inference metrics and logging

- REQ-5.8: Per-frame inference latency and per-mission throughput are
  captured via the existing `observability.py` `log()`/correlation-ID
  pattern (Phase 3/4), alongside the existing download/metadata/frame
  log lines, so a mission's correlation ID traces through detection and
  tracking the same way it already traces through frame processing.

### 5.8 Pipeline integration and failure handling

- REQ-5.9: `commands_consumer.py`'s `handle_command_message()` frame
  loop is extended to run the REQ-5.1 adapter and REQ-5.5 tracker per
  frame, replacing Phase 4's counting-only iteration, and to include
  detection/track counts in the existing `PROCESSING_COMPLETED`
  payload.
- REQ-5.10: A model load failure or an unrecoverable per-frame
  inference error reuses Phase 3/4's bounded-retry (REQ-3.9) and
  dead-letter (REQ-3.10) machinery and publishes `PROCESSING_FAILED`
  with a structured reason (REQ-4.11's existing pattern) — no new
  failure path is introduced.

### 5.9 Testing

- REQ-5.11: Unit tests cover the detector adapter (against a fake/stub
  ONNX session so tests do not depend on a real model file),
  confidence-threshold filtering, class-allow-list filtering, and
  tracker integration in isolation.
- REQ-5.12: Evaluation fixtures extend Phase 4's synthetic sample video
  (`samples/sample-mission-clip.mp4`) with an expected
  detection/track-count range, asserted via threshold-based checks
  (e.g. "at least N detections of class X across the clip"), not exact
  match — model output is not guaranteed bit-identical across
  environments, per [[Coding_Standards]]'s "model behavior: evaluation
  fixtures and threshold-based checks" testing expectation.

## 6. Technical approach (ordered task list)

1. Draft and accept the Section 7 ADR: model choice (YOLOv8n vs
   YOLO11n) and the detector-adapter interface shape.
2. Define the REQ-5.1 adapter interface and a fake/stub implementation
   first, so the consumer pipeline and its tests can be wired and
   verified independent of a real model file.
3. Export the chosen YOLO model to ONNX; implement the real ONNX
   Runtime-backed adapter (REQ-5.2); decide and document model file
   provisioning (`models/` vs fetched at startup, per
   [[Repository_Structure]]).
4. Implement confidence-threshold and class-allow-list filtering
   (REQ-5.3/5.4), with the allow-list defined as an explicit,
   reviewable constant, not inferred from the model's full class list.
5. Integrate the chosen tracker (REQ-5.5) against the filtered
   per-frame detections.
6. Add the `DETECTION_PUBLISHED` payload to `packages/event-schemas`
   (JSON Schema + TS + Pydantic, REQ-5.6) and wire publishing from
   `commands_consumer.py` to `aidefense.detections`.
7. Wire REQ-5.7's annotated-video generation and MinIO upload using
   Phase 4's existing annotation/storage utilities.
8. Extend structured logging with per-frame/per-mission inference
   metrics (REQ-5.8).
9. Integrate steps 2-8 into `commands_consumer.py`'s frame loop
   (REQ-5.9), and extend the retry/DLQ/`PROCESSING_FAILED` path to
   cover model/inference failures (REQ-5.10).
10. Extend the sample fixture with expected detection/track counts;
    write unit tests (REQ-5.11) and threshold-based evaluation tests
    (REQ-5.12).
11. Update [[Vision_Service_Shell]] and `docs/roadmap/Progress.md`.

## 7. ADRs required before/during Phase 5

1. **Model choice and detector-adapter interface** — YOLOv8n vs
   YOLO11n (or an equivalent CPU-friendly, ONNX-exportable model) and
   the exact shape of the REQ-5.1 adapter interface. Flagged as
   required by [[MVP_Implementation_Plan]]'s ADR summary and
   deliberately deferred by [[PRD-Phase-4]] Section 7. Next ADR number:
   `ADR-006`.
2. **Tracker choice** — ByteTrack vs BoT-SORT — may be folded into
   ADR-006 as a second decision, or split into its own ADR if the
   trade-offs (dependency weight, re-identification quality, licensing)
   warrant separate treatment; resolved during Section 6 step 1, not
   before.

Use `docs/adr/ADR-000-template.md`.

## 8. Success criteria / Definition of Done

- A mission's video, submitted end-to-end from `apps/api` through
  Phase 3's Kafka path, produces real `Detection` events on
  `aidefense.detections` — bounding box, class, confidence, track ID,
  frame timestamp — not the Phase 4 stub's frame-count-only completion.
- Only allow-listed civilian/synthetic classes are ever published,
  annotated, or logged as detections; verified by a test asserting an
  out-of-allow-list class is dropped even if the model detects it.
- Track IDs remain stable for the same object across consecutive
  frames in the evaluation fixture.
- An annotated output video, with real bounding boxes and labels drawn,
  is uploaded to MinIO per mission.
- A model load failure or inference error produces `PROCESSING_FAILED`
  through the existing retry/DLQ path, not an unhandled exception.
- Per-frame inference latency is visible in structured logs.
- Unit tests (REQ-5.11) and threshold-based evaluation tests (REQ-5.12)
  pass against the committed synthetic fixture, both locally and in CI.
- `packages/event-schemas`'s three-way sync test
  (`test_event_schema_sync.py`) still passes with the new
  `DETECTION_PUBLISHED` payload included.

## 9. Dependencies

- Upstream: Phase 4's `Frame`/`Detection` contracts, bounded-memory
  frame iteration, `annotation/draw.py`, and `storage/minio_client.py`
  (all extended, not replaced, by this phase); Phase 3's Kafka
  producer/consumer, idempotency, retry/DLQ, and correlation-ID
  baseline; Phase 3's `aidefense.detections` topic declaration
  (REQ-3.1/3.2), populated for the first time by this phase.
- Prerequisite, same recurring gap as Phases 1/3/4: `apps/vision-service/uv.lock`
  must be re-locked (`uv lock` on a machine with network access) before
  or immediately after this phase's new dependencies (ONNX Runtime, a
  tracker library, and any YOLO export tooling) are added to
  `pyproject.toml`, per [[Vision_Service_Shell]]'s Known gaps.
- Blocks: Phase 6 (Frontend Mission Workspace), whose detection-overlay
  video player and event timeline need real `aidefense.detections`
  events and an annotated video artifact; Phase 7 (GIS and Telemetry),
  whose map layer needs real detection points to correlate with
  telemetry.

## 10. Risks

| Risk                                                                                          | Mitigation                                                                                                                       |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Model accuracy is mistaken for certainty (top platform risk, [[Initial_Risk_Register]])       | Every published detection carries confidence and track ID; no autonomous decision or action is ever taken from a detection alone     |
| Public framing implies autonomous weapon capability                                             | Hard-enforced class allow-list (REQ-5.4) at the filtering step, not just documentation; explicit non-goal in Section 4                |
| GPU-specific optimization reduces portability                                                   | This phase stays CPU-only ONNX Runtime behind the REQ-5.1 adapter; TensorRT/GPU work is scoped to Phase 9, behind the same interface  |
| `uv.lock` not re-locked for this phase's new dependencies (recurring gap, see Dependencies)     | Re-lock on a machine with network access before/at the start of implementation, not after                                            |
| Non-deterministic model output makes exact-match tests flaky across environments                | Threshold-based evaluation fixtures (REQ-5.12), per [[Coding_Standards]]'s model-testing expectation, never exact-match assertions    |
| Large model binary bloats the repository                                                        | Follow [[Repository_Structure]]'s rule: small/licensed models only under `models/`; otherwise fetched at build/startup, not committed |
| Frame-by-frame inference latency starves the async Kafka consumer loop                          | Start synchronous-per-message (same open question Phase 4 deferred); revisit only if Phase 13's load testing shows it matters        |

(See also [[Initial_Risk_Register]] for platform-wide risks.)

## 11. Open questions

- Final model choice (YOLOv8n vs YOLO11n vs another CPU-friendly,
  ONNX-exportable option) and tracker choice (ByteTrack vs BoT-SORT) —
  resolved via the Section 7 ADR(s) before implementation.
- Where the ONNX model file is provisioned from: committed under
  `models/` (only if small/licensed per [[Repository_Structure]]),
  fetched from object storage at startup, or downloaded during the
  Docker build — pick whichever keeps `apps/vision-service`'s
  reproducibility simplest, revisit only if licensing or size forces a
  different answer.
- Whether inference runs synchronously in the consumer's frame loop or
  is offloaded to a thread/process pool — same deferred question Phase
  4 raised for frame iteration; start synchronous, revisit only under
  real load evidence (Phase 13).
- Exact allow-list contents (which civilian/synthetic classes are
  in-scope) — a product/safety decision, not a purely technical one;
  should be reviewed against `README.md`'s safety boundary before
  Section 6 step 4 is implemented, not decided unilaterally in code.

---

## Relationship to other documents

- Derived from the "Phase 5 — AI Detection and Tracking" section of
  [[MVP_Implementation_Plan]] and the roadmap's Phase 5 entry in
  [[AI_Defense_Platform_Roadmap]].
- Structure mirrors [[PRD-Phase-1]], [[PRD-Phase-2]], [[PRD-Phase-3]],
  and [[PRD-Phase-4]].
- Extends the `Frame`/`Detection` contracts, frame iteration, and
  annotation utilities built in [[PRD-Phase-4]] and documented in
  [[Vision_Service_Shell]].

---

## Related Notes

- [[MVP_Implementation_Plan]]
- [[AI_Defense_Platform_Roadmap]]
- [[PRD-Phase-4]]
- [[Vision_Service_Shell]]
- [[Technology_Decisions]]
- [[Coding_Standards]]
- [[Repository_Structure]]
- [[Initial_Risk_Register]]
- [[Guiding_Principles]]
- [[ADR-000-template]]
