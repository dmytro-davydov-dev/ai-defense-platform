---
title: "PRD — Phase 4: Python and OpenCV Foundation"
type: prd
tags: [mvp, prd, phase4]
status: draft
---

# PRD — Phase 4: Python and OpenCV Foundation

Version: 1.0
Status: Draft
Date: 2026-07-14
Owner: Dmytro
Related documents: [[MVP_Implementation_Plan]], [[AI_Defense_Platform_Roadmap]], [[PRD-Phase-3]], [[Vision_Service_Shell]], [[Coding_Standards]], [[Repository_Structure]]

---

## 1. Summary

Phase 4 turns `apps/vision-service` from a thin Kafka consumer that only
proves a command arrived (Phase 3's deliberate stub —
`note="stub: no frame processing in Phase 3"`) into a real computer-vision
runtime: OpenCV-based video/image I/O, bounded-memory frame iteration,
preprocessing/annotation utilities, metadata extraction, and normalized
Frame/Detection contracts. It replaces the Phase 3 stub's
`PROCESSING_STARTED`/`PROCESSING_COMPLETED` publish with one driven by
actually downloading the mission's video from MinIO and iterating its
frames — but it still runs no detection model. Phase 4 builds the
substrate; Phase 5 plugs YOLO/ONNX Runtime into it.

## 2. Problem statement

`commands_consumer.py` (Phase 3, REQ-3.13) already consumes
`MISSION_PROCESSING_REQUESTED` and idempotently publishes stub progress
events, but it never touches the actual video: no MinIO download, no
frame decoding, no metadata, no annotation. `docs/ai/`, `docs/c4/`, and
`docs/edge/` have no notes yet, per [[MOC]], because there is nothing
grounded to document there before this phase and Phase 5/9. Every later
MVP phase depends on this gap closing: Phase 5's detector adapter needs
a real frame stream and a normalized `Frame`/`Detection` contract to
operate on, and Phase 6's video player/detection-overlay UI needs
metadata (duration, fps, resolution) that today does not exist anywhere
in the platform. Without Phase 4, "AI-based object detection and
tracking" (`docs/vision/Goals.md`'s MVP goal) has no runtime to attach
to.

## 3. Goals

- `apps/vision-service` restructured/confirmed as a typed `src`-layout
  Python package (already adopted early in Phase 1/3 per
  [[Vision_Service_Shell]], not re-done here — just carried forward).
- OpenCV-based video and image readers with a bounded-memory
  frame-iteration generator — no unbounded frame accumulation, per
  [[Coding_Standards]]'s Python section.
- Preprocessing (resize/normalize) and annotation (bounding-box/label
  drawing) utilities, isolated behind adapters so Phase 5's detector
  output can be drawn without changing this phase's code.
- Metadata extraction: duration, fps, resolution, checksum, computed
  once per source video.
- `/health`, `/ready`, `/version` FastAPI endpoints extended so `/ready`
  reflects real Kafka consumer and MinIO connectivity (today it "always
  reports ready," per [[Vision_Service_Shell]], since the shell has no
  dependencies to check yet).
- Structured JSON logging, already correlation-ID-aware from Phase 3's
  `observability.py`, extended to cover frame-processing log lines
  (download start/end, frame counts, processing duration).
- Normalized `Frame`/`Detection` Pydantic contracts mirroring
  `packages/event-schemas`, ready for Phase 5 to populate with real
  detection output.
- The Kafka consumer path (`commands_consumer.py`) downloads the source
  video from MinIO on `MISSION_PROCESSING_REQUESTED`, iterates its
  frames for real, and publishes `PROCESSING_STARTED`/
  `PROCESSING_COMPLETED` (or `PROCESSING_FAILED`) based on that real
  work — still no model inference.
- Unit tests plus integration tests using a small, deterministic
  synthetic fixture video.

## 4. Non-goals (explicitly out of scope for Phase 4)

- Any model inference, object detection, or tracking — the
  `Detection` contract this phase defines stays empty/unpopulated in
  practice; YOLO/ONNX Runtime wiring is Phase 5.
- Annotated video as a real detection overlay — the annotation utility
  (bounding-box/label drawing) is built and unit-tested this phase, but
  nothing calls it with real detections until Phase 5.
- Any change to `aidefense.detections`' payload content — the topic and
  schema already exist (Phase 3, REQ-3.1/3.3); this phase does not
  publish to it.
- GIS/telemetry, frontend video player, or WebSocket relay work
  (Phases 6/7).
- Resolving the Phase 1/3 `uv.lock`-not-committed gap by itself — see
  Dependencies and Risks below; it is a prerequisite this phase depends
  on, not a Phase 4 deliverable, but it must be closed before Phase 4's
  new dependencies (`opencv-python-headless`, an S3 client) can be
  reliably locked and installed.
- A model-choice or detector-adapter-interface ADR — that is Phase 5's
  ADR per [[MVP_Implementation_Plan]]'s ADR summary; this phase adds no
  model-facing abstraction, only the frame/metadata substrate under it.

## 5. Requirements

### 5.1 Package structure

- REQ-4.1: `apps/vision-service/src/vision_service/` remains the single
  typed `src`-layout package; this phase's new modules (`video/`,
  `frames/`, `annotation/`, `metadata/`) are added under it rather than
  as a parallel structure, consistent with how Phase 3's `events/` and
  `kafka/` were added.

### 5.2 Video/image I/O and frame iteration

- REQ-4.2: An OpenCV-based video reader opens a video file (local path
  or MinIO-downloaded temp file) and exposes a generator that yields one
  decoded frame at a time — no full-video buffering into memory, per
  [[Coding_Standards]]'s "no unbounded frame accumulation" rule.
- REQ-4.3: An equivalent image reader handles single-image inputs
  (still images alongside video) through the same preprocessing/
  annotation utilities, so the pipeline is not video-only from day one.

### 5.3 Preprocessing and annotation utilities

- REQ-4.4: A preprocessing module implements resize and normalize
  operations on a decoded frame, with NumPy array shapes documented per
  [[Coding_Standards]] (e.g. `HxWxC`, `uint8` vs normalized `float32`).
- REQ-4.5: An annotation module draws bounding boxes and labels onto a
  frame given a list of `Detection` objects (REQ-4.9) — implemented and
  unit-tested against hand-constructed `Detection` fixtures this phase,
  since no real model output exists until Phase 5.

### 5.4 Metadata extraction

- REQ-4.6: A metadata module extracts duration, fps, resolution, and a
  content checksum (e.g. SHA-256) from a source video once, before
  frame iteration begins, so Phase 6's UI has this data available and
  Phase 3's idempotency/audit trail can reference a stable checksum
  independent of the MinIO object key.

### 5.5 Control endpoints and readiness

- REQ-4.7: `/ready` (`routes/health.py`) is extended to reflect real
  dependency state — the Kafka consumer's connection status
  (`runner.py`) and a lightweight MinIO reachability check — replacing
  the Phase 1/3 placeholder that "always reports ready."

### 5.6 Structured logging

- REQ-4.8: Frame-processing log lines (download start/end, frame count,
  per-video processing duration, checksum) use the same
  `observability.py` `log()`/correlation-ID pattern as Phase 3's Kafka
  consumer logs, so a mission's correlation ID traces through frame
  processing the same way it does through the broker.

### 5.7 Normalized contracts

- REQ-4.9: `Frame` and `Detection` are defined as Pydantic models in
  `src/vision_service/`, mirroring the shape `packages/event-schemas`
  will eventually carry on `aidefense.detections` (Phase 5) — `Frame`
  carries at least frame index, timestamp, and shape; `Detection`
  carries bounding box, class label, and confidence fields left
  unpopulated by this phase's stub pipeline.

### 5.8 Real consumer pipeline

- REQ-4.10: `commands_consumer.py`'s `handle_command_message()` is
  extended so that, after the existing REQ-3.8 idempotency check, it
  downloads the mission's source video from MinIO (signed download URL
  or direct bucket access, consistent with `apps/api`'s `StorageModule`
  conventions), extracts metadata (REQ-4.6), and iterates frames
  (REQ-4.2) — replacing the Phase 3 stub's immediate
  `PROCESSING_STARTED` → `PROCESSING_COMPLETED` publish with one that
  reflects this real work actually happening.
- REQ-4.11: A download or decode failure (corrupt video, missing MinIO
  object, unsupported codec) publishes `PROCESSING_FAILED` with a
  structured reason, reusing Phase 3's bounded-retry (REQ-3.9) and
  dead-letter (REQ-3.10) machinery rather than introducing a new failure
  path.

### 5.9 Testing

- REQ-4.12: Unit tests cover the video/image readers, preprocessing,
  annotation, and metadata modules in isolation; integration tests run
  the extended `commands_consumer.py` against a small, deterministic
  synthetic fixture video (checked into `samples/`, per
  [[Repository_Structure]]'s "datasets and model binaries are not
  committed unless explicitly licensed and small" rule) to prove
  frame-by-frame processing and real progress events end-to-end.

## 6. Technical approach (ordered task list)

1. Confirm `apps/vision-service/src/vision_service/`'s existing `src`
   layout needs no restructuring (REQ-4.1) — verify against Phase 1/3's
   scaffold before adding new modules.
2. Implement the OpenCV video/image readers and bounded-memory frame
   generator (REQ-4.2/4.3).
3. Implement preprocessing (resize/normalize) and annotation
   (bounding-box/label drawing) utilities (REQ-4.4/4.5).
4. Implement metadata extraction (duration, fps, resolution, checksum)
   (REQ-4.6).
5. Define `Frame`/`Detection` Pydantic contracts (REQ-4.9), mirroring
   `packages/event-schemas` conventions from Phase 3.
6. Extend `/ready` to check real Kafka/MinIO connectivity (REQ-4.7).
7. Extend structured logging to frame-processing log lines (REQ-4.8).
8. Wire the real pipeline into `commands_consumer.py`: MinIO download →
   metadata extraction → frame iteration → real
   `PROCESSING_STARTED`/`PROCESSING_COMPLETED`/`PROCESSING_FAILED`
   publish, reusing Phase 3's retry/DLQ/idempotency machinery
   (REQ-4.10/4.11).
9. Add a small synthetic fixture video under `samples/`; write unit
   tests per module and integration tests for the extended consumer
   (REQ-4.12).
10. Update [[Vision_Service_Shell]] (status moves from "no real frame
    processing" to real frame iteration) and `docs/roadmap/Progress.md`.

## 7. ADRs required before/during Phase 4

None anticipated. OpenCV and MinIO/S3-compatible storage are already
accepted platform-wide choices in [[Technology_Decisions]]; this phase
only builds implementation on top of decisions already made. A
detector-adapter-interface ADR remains Phase 5's responsibility per
[[MVP_Implementation_Plan]]'s ADR summary — this phase's `Detection`
contract (REQ-4.9) is deliberately kept minimal so it does not preempt
that decision.

## 8. Success criteria / Definition of Done

- A mission submitted via `apps/api` (`DRAFT` → `QUEUED`) results in
  `apps/vision-service` actually downloading the source video from
  MinIO, extracting real metadata, and iterating every frame — not the
  Phase 3 stub's immediate no-op completion.
- `PROCESSING_STARTED`/`PROCESSING_COMPLETED` events carry real frame
  counts and processing duration, not the Phase 3 stub note.
- A corrupt or missing video produces `PROCESSING_FAILED` through the
  existing retry/DLQ path (REQ-3.9/3.10), not an unhandled exception.
- `/ready` reports not-ready when Kafka or MinIO is actually
  unreachable, verified by a manual disconnect test.
- Preprocessing, annotation, and metadata utilities are unit-tested in
  isolation, independent of the Kafka consumer.
- Integration tests (REQ-4.12) pass against a committed synthetic
  fixture video, both locally and in CI.
- No unbounded in-memory frame buffering exists anywhere in the new
  code path (spot-checked, since this is a correctness property, not
  something a single test can fully prove).

## 9. Dependencies

- Upstream: Phase 3's Kafka consumer, idempotency, retry/DLQ, and
  correlation-ID baseline (`commands_consumer.py`, `retry.py`,
  `dead_letter.py`, `observability.py` — all extended, not replaced,
  by this phase) and Phase 2's MinIO `StorageModule` conventions
  (signed URLs) that this phase's download path should follow for
  consistency.
- Prerequisite, not strictly blocking but flagged per
  [[Vision_Service_Shell]]'s Known gaps: `apps/vision-service/uv.lock`
  should be generated and committed from a machine with normal network
  access before this phase's new dependencies
  (`opencv-python-headless`, an S3/MinIO client) are added, so they lock
  reproducibly rather than compounding the existing gap.
- Blocks: Phase 5 (AI Detection and Tracking), which plugs a real
  detector behind the `Frame`/`Detection` contracts and frame-iteration
  loop this phase creates; Phase 6's video player/detection-overlay UI,
  which needs this phase's metadata (duration, fps, resolution) even
  before Phase 5 gives it real detections to render.

## 10. Risks

| Risk                                                                                                    | Mitigation                                                                                                            |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `uv.lock` still not committed (per [[Vision_Service_Shell]]'s Known gaps) — new deps compound the gap | Generate/commit `uv.lock` from a machine with normal network access before or at the start of this phase, not after |
| Large videos cause memory pressure despite a generator-based reader                                      | Enforce the frame-generator contract in code review; add a regression test with a longer fixture if memory issues surface |
| GPU-specific optimization reduces portability (per [[Initial_Risk_Register]])                            | This phase stays CPU-only OpenCV decoding; GPU/ONNX concerns are scoped to Phase 5's adapter, not introduced here          |
| Synthetic fixture video licensing/size creep                                                              | Keep the fixture small, generated (not sourced from real footage), and explicitly licensed per [[Repository_Structure]]  |
| Checksum/metadata extraction adds latency to every mission                                                | Measure once during Phase 4 testing; defer any optimization until Phase 11's observability makes the cost measurable      |

(See also [[Initial_Risk_Register]] for platform-wide risks.)

## 11. Open questions

- Whether the video download uses a signed URL (matching `apps/api`'s
  `StorageModule` pattern exactly) or a direct MinIO/S3 client call from
  `apps/vision-service` — either satisfies REQ-4.10; pick whichever
  keeps credential handling simplest and revisit only if it becomes an
  actual security concern (see [[Security_Baseline]]).
- Which checksum algorithm to standardize on (SHA-256 assumed above) —
  low-stakes choice, driven by whatever `apps/api`'s upload path already
  computes, if anything, to avoid two different checksums for the same
  object.
- Whether frame iteration runs synchronously (blocking the event loop
  briefly per message) or is offloaded to a thread/process pool given
  `aiokafka`'s async consumer loop (Phase 3) — start with the simplest
  synchronous-per-message approach and revisit only if it measurably
  starves the consumer loop under Phase 13's later load testing.

---

## Relationship to other documents

- Derived from the "Phase 4 — Python and OpenCV Foundation" section of
  [[MVP_Implementation_Plan]] and the roadmap's Phase 4 entry in
  [[AI_Defense_Platform_Roadmap]].
- Structure mirrors [[PRD-Phase-1]], [[PRD-Phase-2]], and
  [[PRD-Phase-3]].
- Extends the Kafka consumer, idempotency, retry/DLQ, and
  correlation-ID work already built in [[PRD-Phase-3]] and documented in
  [[Vision_Service_Shell]].

---

## Related Notes

- [[MVP_Implementation_Plan]]
- [[AI_Defense_Platform_Roadmap]]
- [[PRD-Phase-3]]
- [[Vision_Service_Shell]]
- [[Coding_Standards]]
- [[Repository_Structure]]
- [[Technology_Decisions]]
- [[Initial_Risk_Register]]
