---
title: Vision Service Shell
type: python
tags: [python, phase1, phase3, phase4, phase5]
status: accepted
---

# Vision Service Shell

`apps/vision-service` started as a Phase 1 scaffold
(`docs/mvp-plan/PRD-Phase-1.md`, REQ-1.5, REQ-1.13-1.15), gained a real
Kafka consumer in Phase 3 (`docs/mvp-plan/PRD-Phase-3.md`,
REQ-3.8/3.9/3.11/3.13), real OpenCV frame processing in Phase 4
(`docs/mvp-plan/PRD-Phase-4.md`, REQ-4.1-4.12), and real object
detection/tracking in Phase 5 (`docs/mvp-plan/PRD-Phase-5.md`,
REQ-5.1-5.12): the consumer now downloads the mission's video from
MinIO, extracts real metadata, and for every frame runs a detector
adapter, filters by confidence/class allow-list, tracks across frames,
draws annotations, and publishes one `DETECTION_PUBLISHED` event per
retained detection — then uploads the annotated video to MinIO. See
[[ADR-006-detection-model-and-tracker]] for the model/tracker choices.

## What exists today

- `src/vision_service/` — typed Python package, `src` layout (the same
  layout Phase 4's step 1 calls for, adopted early rather than
  restructured later).
- FastAPI app (`main.py`) with `/health`, `/ready`, `/version`
  (`routes/health.py`) — `/ready` always reports ready today since the
  shell has no dependencies; it will check Kafka consumer connectivity
  and MinIO once Phase 4 wires them in.
- `settings.py`: `pydantic-settings`-based config sourced from
  `VISION_SERVICE_*` environment variables / `.env` — no hardcoded
  config (REQ-1.18).
- Dependency management via **uv** (see [[ADR-002-python-dependency-manager]]),
  `pyproject.toml` pinning `requires-python = ">=3.12"`.
- Ruff configured for lint + format (`select = [E, F, I, UP, B, N, SIM]`).
- pytest + FastAPI `TestClient`: three trivial tests covering `/health`,
  `/ready`, `/version` (REQ-1.14).

## Phase 3: the Kafka consumer side

- `src/vision_service/events/` — Pydantic mirror of
  `packages/event-schemas`: a generic `EventEnvelope[TPayload]`
  (`envelope.py`, explicit `TypeVar`/`Generic` rather than PEP 695
  syntax — see Known gaps), per-eventType payload models
  (`payloads.py`), and `Topics` (`topics.py`). Cross-language field
  parity with the JSON Schema and TS types is enforced by
  `tests/test_event_schema_sync.py`, not by hand.
- `src/vision_service/observability.py` — a Python mirror of
  `packages/observability`'s `log()`/`CORRELATION_ID_HEADER`, so every
  consumer log line here carries `correlationId` the same way
  `apps/api`'s does (REQ-3.11).
- `src/vision_service/kafka/` — the consumer side of REQ-3.8/3.9/3.13:
  - `idempotency.py`: `mark_processed()` against the `processed_events`
    table (`INSERT ... ON CONFLICT DO NOTHING`), the one and only
    reason this service touches Postgres directly — everything else
    here goes through Kafka, not the database.
  - `retry.py`: `with_bounded_retry()`, a Python mirror of
    `apps/api/src/kafka/retry.util.ts` (3 attempts, exponential
    backoff, never raises).
  - `dead_letter.py`: builds the `EVENT_DEAD_LETTERED` envelope
    published to `aidefense.dead-letter` once retries are exhausted.
  - `commands_consumer.py`: `handle_command_message()` — consumes
    `aidefense.commands`, checks idempotency, and (stub only — no real
    frame processing yet) publishes `PROCESSING_STARTED` then
    `PROCESSING_COMPLETED` to `aidefense.processing-events`.
  - `runner.py`: real `aiokafka` `AIOKafkaConsumer`/`AIOKafkaProducer`
    wiring, started/stopped from `main.py`'s FastAPI `lifespan`.
- `settings.py` gained `kafka_brokers`/`database_url`
  (`KAFKA_BROKERS`/`DATABASE_URL` env vars) alongside the existing
  `VISION_SERVICE_*` settings.
- `pyproject.toml` gained `aiokafka`, `asyncpg`, `pytest-asyncio`
  (`asyncio_mode = "auto"`, so `tests/test_retry.py`,
  `test_idempotency.py`, `test_commands_consumer.py` use plain `async
  def test_...()` with no explicit markers).

## Phase 4: real OpenCV frame processing

- `video/reader.py` (`VideoReader`, REQ-4.2) — OpenCV `VideoCapture`
  wrapped as a context manager, `frames()` is a bounded-memory
  generator (one `HxWxC uint8` frame at a time, never buffers the
  whole video).
- `video/image_reader.py` (`read_image`, REQ-4.3) — single-image input
  through the same `HxWxC uint8` shape/dtype convention.
- `frames/models.py` (`Frame`/`Detection`/`BoundingBox`, REQ-4.9) —
  camelCase Pydantic contracts mirroring the shape
  `packages/event-schemas` will carry on `aidefense.detections` once
  Phase 5 populates it; `Detection` stays unpopulated by this phase's
  pipeline.
- `frames/preprocessing.py` (`resize`/`normalize`, REQ-4.4) —
  `HxWxC uint8` in, `uint8` (resize) or `float32` in `[0, 1]`
  (normalize) out, documented shapes per Coding_Standards.md.
- `annotation/draw.py` (`draw_detections`, REQ-4.5) — draws
  bounding-box/label overlays given a `list[Detection]`; unit-tested
  against hand-built fixtures only, since no real detector exists yet.
- `metadata/extract.py` (`extract_video_metadata`, REQ-4.6) — duration,
  fps, resolution, and a chunked (bounded-memory) SHA-256 checksum,
  read once before frame iteration begins.
- `storage/minio_client.py` (`MinioClient`, REQ-4.10) — a synchronous
  `boto3` S3 client against the same `MINIO_*` env vars `apps/api`'s
  `StorageService` uses, called via `asyncio.to_thread` from the async
  consumer path. Module-level singleton (`minio_client`), shared by the
  pipeline and `/ready`.
- `kafka/commands_consumer.py`'s `handle_command_message` now takes a
  fourth `minio_client` parameter and, after the REQ-3.8 idempotency
  check: downloads the video to a temp file, extracts metadata,
  publishes `PROCESSING_STARTED` with real metadata fields, iterates
  every frame via `VideoReader` (counting only — no model inference),
  then publishes `PROCESSING_COMPLETED` with the real frame count and
  processing duration. `ProcessingStartedPayload`/
  `ProcessingCompletedPayload` gained optional fields for this
  (additive per `ADR-005-event-schema-versioning`, no `eventVersion`
  bump) — see `packages/event-schemas/src/payloads.ts` and the mirrored
  JSON Schema files.
- REQ-4.11: an unrecoverable download/decode failure (after REQ-3.9's
  3 retries) now publishes `PROCESSING_FAILED` with a structured
  reason **in addition to** the existing dead-letter publish — the
  Phase 3 stub never published `PROCESSING_FAILED` at all, so
  `apps/api`'s `processing-events.handler.ts` (which already mapped
  this event type to `MissionStatus.FAILED`) had no way to actually
  observe a vision-service failure until this phase. If publishing the
  `PROCESSING_FAILED` announcement itself fails (e.g. the same broker
  outage that caused the original failure), that's logged and
  swallowed rather than crashing the consumer loop — the DLQ publish
  is the higher-priority delivery and still goes through.
- REQ-4.7: `/ready` now returns `{"status", "kafka", "minio"}` —
  `kafka.runner.commands_consumer_runner.is_ready` and
  `storage.minio_client.minio_client.is_reachable()` (via
  `asyncio.to_thread`, `HeadBucket`). Either check is skipped
  (treated as ready) if its dependency isn't configured at all, the
  same "disabled, not broken" treatment blank `KAFKA_BROKERS`/
  `DATABASE_URL` already got. `commands_consumer_runner` moved from a
  `main.py`-local instantiation to a `kafka.runner`-module-level
  singleton so `routes/health.py` can import the same instance without
  a circular import.
- `samples/sample-mission-clip.mp4` (12 frames, 64x48, 4fps) and
  `samples/sample-frame.png` — synthetic, deterministic fixtures
  (`apps/vision-service/scripts/generate_samples.py` regenerates them
  byte-identically), used by REQ-4.12's unit and
  `commands_consumer.py` integration tests. No real MinIO/Kafka/
  Postgres needed — `FakeMinioClient` in `tests/test_commands_consumer.py`
  just copies the fixture to the requested temp path.

## Phase 5: real detection and tracking

- `detection/adapter.py` (REQ-5.1) — `DetectorAdapterLike` Protocol
  (`detect(frame) -> list[Detection]`) plus `NullDetectorAdapter`, the
  zero-detection fallback used both when
  `VISION_SERVICE_DETECTION_MODEL_PATH` is unset (production
  "disabled, not broken" default) and directly in tests that don't
  care about detection output.
- `detection/classes.py` (REQ-5.4) — `COCO_CLASSES` (the model's
  80-class vocabulary) and `ALLOWED_CLASSES` (the safety-reviewed
  civilian/synthetic allow-list, a strict subset, not
  settings/env-configurable).
- `detection/filters.py` (REQ-5.3/5.4) — `filter_detections()`, the
  one shared confidence-threshold + class-allow-list stage every
  detector adapter implementation goes through.
- `detection/tracker.py` (REQ-5.5) — `Tracker`, an in-house,
  dependency-free, per-label greedy IoU tracker (not the external
  ByteTrack/BoT-SORT packages the roadmap names — see
  [[ADR-006-detection-model-and-tracker]] for why). One instance per
  mission, constructed fresh inside `detection/pipeline.py`.
- `detection/onnx_detector.py` (REQ-5.2) — `OnnxDetectorAdapter`, CPU-only
  ONNX Runtime inference against the standard Ultralytics YOLOv8 ONNX
  export layout (`(1, 4+80, num_boxes)`, NMS via `cv2.dnn.NMSBoxes`).
  Accepts an injected `session` for testing without a real `.onnx`
  file — REQ-5.11's tests exercise the pre/postprocessing math against
  a fake session with synthetic output only; no real model has been
  run through this adapter in this sandbox.
- `detection/factory.py` — `detector`, a module-level singleton built
  once at import time (same pattern as `storage.minio_client`):
  `OnnxDetectorAdapter` if `VISION_SERVICE_DETECTION_MODEL_PATH` is
  set, `NullDetectorAdapter` otherwise.
- `detection/pipeline.py` (REQ-5.7/5.9) — `run_detection_pipeline()`,
  the real per-frame body that replaces Phase 4's counting-only loop:
  for every frame, detect -> filter -> track -> annotate
  (`annotation/draw.py`, now called with real, tracked detections,
  the track ID shown in the label) -> write to an annotated-video
  temp file. Returns every retained detection as a `DetectionEvent`
  plus aggregate inference-duration metrics (REQ-5.8). Fully
  synchronous — `kafka/commands_consumer.py` runs it via
  `asyncio.to_thread` as one blocking call, since every step (OpenCV,
  ONNX Runtime) is CPU-bound.
- `frames/models.py`'s `Detection` gained an optional `trackId: int |
  None` field (REQ-5.5), populated only by `Tracker.update()` —
  hand-built `Detection` fixtures in tests still default to `None`,
  unchanged annotation-label format.
- `storage/minio_client.py`'s `MinioClient` gained `upload_from()`
  (REQ-5.7), used to upload the annotated video to
  `missions/{missionId}/annotated.mp4`.
- `kafka/commands_consumer.py`'s `handle_command_message` gained a
  fifth `detector` parameter (REQ-5.9) and now publishes one
  `DETECTION_PUBLISHED` per retained detection to `aidefense.detections`
  (mission ID as the partition key) between `PROCESSING_STARTED` and
  `PROCESSING_COMPLETED`; `PROCESSING_COMPLETED` gained optional
  `detectionCount`/`trackCount`/`annotatedVideoObjectKey` fields
  (additive, ADR-005, no `eventVersion` bump). A model-load or
  inference failure (`ModelLoadError`/`ModelInferenceError`/
  `DetectionPipelineError`) is now special-cased in
  `_structured_failure_reason()` alongside Phase 4's
  `VideoOpenError`/`MetadataExtractionError`, reusing the same
  retry/DLQ/`PROCESSING_FAILED` path (REQ-5.10).
- `packages/event-schemas` gained `DETECTION_PUBLISHED` (JSON Schema +
  TS + Pydantic, REQ-5.6) and additive `ProcessingCompletedPayload`
  fields; `tests/test_event_schema_sync.py`'s three-way check covers
  the new payload too. `EVENT_SCHEMAS_PACKAGE_VERSION` bumped to
  `0.3.0`.
- 61 new/extended tests this phase (`test_detection_filters.py`,
  `test_detection_tracker.py`, `test_detection_onnx_detector.py`,
  `test_detection_pipeline.py`, plus `test_commands_consumer.py`
  rewritten for the 5-argument `handle_command_message` and the new
  DETECTION_PUBLISHED/annotated-upload behavior) — 86 tests total in
  `apps/vision-service`, all passing against this sandbox's system
  Python 3.10; `ruff check`/`ruff format --check` clean. TS side:
  `@ai-defense/event-schemas`'s lint/typecheck/test/build all pass;
  `@ai-defense/api`'s typecheck reports success against the widened
  `ProcessingCompletedPayload` type (a trailing sandbox-only `Operation
  not permitted` error after that success line is the same mount-
  permission class of issue as this file's `uv.lock`/`.git/index.lock`
  gaps below, not a typecheck failure).

### Known gap: no real `.onnx` model has been run through `OnnxDetectorAdapter`

Per [[ADR-006-detection-model-and-tracker]]'s Risks: this sandbox has
no network access to fetch or export a real YOLO model, and
[[Repository_Structure]] explicitly forbids committing one anyway.
`VISION_SERVICE_DETECTION_MODEL_PATH` is unset here, so
`detection.factory.detector` resolves to `NullDetectorAdapter` — the
full pipeline (filtering, tracking, annotation, event publishing,
`PROCESSING_COMPLETED`) has been verified end-to-end via scripted/fake
detectors, not against a real model's real output distribution. A real
model run, and a real `docker compose up` end-to-end submission,
remain open on a normal dev machine — same category as Phase 4's
Python-3.12/Docker verification gap below.

## Known gap: `uv.lock` committed, but Phase 4's new dependencies aren't locked by it yet

`uv.lock` (flagged as missing through Phase 1/3) is now committed —
generated on a machine with normal network access outside this session,
before this phase's work began. This sandbox still cannot run `uv
sync`/`uv lock` itself (`uv python install` needs
`python-build-standalone` from GitHub's release CDN, still unreachable
here — re-confirmed this session). That means Phase 4's three new
dependencies (`opencv-python-headless`, `numpy`, `boto3`) were added to
`pyproject.toml`'s `[project.dependencies]` by hand this session but
**not** re-locked into `uv.lock` — `uv sync --frozen` (what
`apps/vision-service/Dockerfile` runs) will fail until `uv lock` is
re-run on a machine with network access. This is the same category of
gap as the original `uv.lock` entry, now specifically about staying in
sync after a dependency change rather than not existing at all.

Phase 5 adds one more: `onnxruntime` was added to `pyproject.toml`'s
`[project.dependencies]` the same way and is **also not yet locked**
into `uv.lock` — installed via plain `pip install --break-system-packages`
in this sandbox (confirmed importable, `onnxruntime==1.23.2`) for
verification only, same workaround as Phase 4's three dependencies. No
tracker-specific dependency was needed (the in-house tracker is
dependency-free by design, per [[ADR-006-detection-model-and-tracker]]).
`uv lock` must be re-run on a machine with network access before
`uv sync --frozen` succeeds again.

## What's deliberately not here yet

- No real trained model file — `OnnxDetectorAdapter` (REQ-5.2) is real
  code, exercised only against a fake ONNX session with synthetic
  output (see this file's Phase 5 Known gap above); no real weapon,
  target-scoring, or engagement-relevant capability exists or is
  planned, per the platform's permanent safety boundary.
- Any expansion of `detection.classes.ALLOWED_CLASSES` beyond the 12
  civilian/synthetic classes chosen in Phase 5 — a deliberate,
  separately reviewed decision, not a default of any future phase.
- `events/*.py`, `kafka/dead_letter.py`/`observability.py`, and (new
  this phase) `frames/models.py`/`metadata/extract.py` deliberately use
  explicit `TypeVar`/`Generic` (not PEP 695 generic syntax) and
  `timezone.utc` (not the 3.11+ `datetime.UTC` alias) where applicable,
  ignored via `pyproject.toml`'s `per-file-ignores` (`N815`, `UP046`,
  `UP047`, `UP017`) — needed so these files stay parseable/importable
  under this sandbox's system Python 3.10, since `requires-python =
  ">=3.12"` but no 3.12 interpreter is reachable here (see the
  `uv.lock` gap above). Revisit once a real 3.12 environment verifies
  this codebase and the ignores can be dropped.
- REQ-3.15's integration tests exercising this service's consumer
  against a real broker/Postgres are written on the `apps/api` side
  (`apps/api/test/kafka-event-platform.e2e-spec.ts`) but not
  vision-service-specific — this service's Kafka code (including
  Phase 4's real pipeline) is covered by unit tests with fake
  `Pool`/`Producer`/`MinioClient` doubles only (`tests/test_retry.py`,
  `test_idempotency.py`, `test_commands_consumer.py`), consistent with
  [[Local_Kafka_Redpanda]]'s Known gaps (no docker in this sandbox).
  `apps/vision-service/tests/`'s full suite (86 tests as of Phase 5,
  including Phase 5's new detection/tracker/onnx-detector/pipeline
  modules) and `ruff check`/`ruff format --check` were verified against
  this sandbox's system Python 3.10 — a real Python 3.12 + Docker run
  of the full Compose stack (per REQ-4.12/5.12's DoD) is still open.

## Phase 8: dataset/training/model-lifecycle tooling

New `training/` package (docs/mvp-plan/PRD-Phase-8.md), all under
`src/vision_service/training/`:

- `coco.py` (REQ-8.4/8.5) — `parse_coco_annotations()`/
  `write_coco_annotations()`, converting COCO JSON to/from the existing
  `Detection`/`BoundingBox` contracts. Hand-rolled against the standard
  library, not `pycocotools` (see
  [[ADR-009-annotation-format]]). Every parsed annotation's category is
  validated against `detection.classes.ALLOWED_CLASSES` — the safety
  boundary applies to training data, not only inference output.
- `evaluate.py` (REQ-8.8/8.13/8.14) — `evaluate()`, per-class
  precision/recall/average-precision via greedy IoU matching (a
  rectangle-rule AP integral, a documented simplification of COCO's
  101-point interpolation), a `flaggedClasses` section for classes
  materially below the dataset's mean AP, and pass-through
  `failureNotes`. Returns a plain camelCase `dict` matching
  `apps/api`'s `EvaluationReportDto` exactly, ready to POST with no
  translation.
- `registry_client.py` (REQ-8.7/8.9/8.10) — a thin `httpx`-based client
  against `apps/api`'s dataset/training-run/model-registry endpoints.
  Every function accepts an injectable `client` (real or
  `httpx.MockTransport`-backed fake), the same testability shape
  `OnnxDetectorAdapter`'s `session` parameter already established.
  Treats an unset `VISION_SERVICE_MODEL_REGISTRY_BASE_URL` as "not
  configured" via `RegistryNotConfiguredError`, not a crash.
- `train.py` (REQ-8.6/8.16) — `run_training_pipeline()`, a pure
  orchestrator over an injectable `TrainerLike` (`train_and_export()`
  returns a `TrainerOutput`); `publish_training_run()` uploads the
  exported `.onnx` to the models bucket and reports the run + registers
  the model via `registry_client`. The real implementation
  (`_ultralytics_trainer.UltralyticsTrainer`) is imported lazily, only
  from `train.py`'s `_default_trainer()`, so this module and its tests
  never require `ultralytics`/`torch` to be installed.
- `_ultralytics_trainer.py` (REQ-8.6) — the real Ultralytics-YOLO-backed
  `TrainerLike`: converts ground-truth `Detection`s into YOLO's
  per-image `.txt` label format, writes a `data.yaml`, trains, and
  exports to ONNX matching [[ADR-006-detection-model-and-tracker]]'s
  exact convention (opset 12, static square input) — Ultralytics'
  own default export shape, no extra postprocessing changes needed.
  **Never executed in this sandbox** — see Known gap below.
- `scripts/run_training.py` — the CLI entry point (mirrors
  `scripts/generate_samples.py`'s "batch job, not a deployed service"
  shape), wiring COCO annotation loading, `run_training_pipeline()`,
  and `publish_training_run()` together with argparse-driven
  hyperparameters.
- `detection/factory.py`'s `build_detector()` gained one new resolution
  path (REQ-8.10): if `VISION_SERVICE_DETECTION_MODEL_PATH` is unset but
  `VISION_SERVICE_MODEL_REGISTRY_BASE_URL` is configured,
  `_resolve_production_model_path()` asks the registry for the current
  production model and downloads it via `MinioClient` before
  constructing `OnnxDetectorAdapter` — closing the promotion loop
  [[ADR-006-detection-model-and-tracker]]'s rollback note only
  described in reverse. Any registry/download failure falls back to
  `NullDetectorAdapter`, never a startup crash.
- `settings.py` gained `model_registry_base_url`,
  `model_registry_api_token`, `model_registry_local_cache_path`, and
  `minio_models_bucket` — all optional, "disabled not broken" defaults,
  same pattern as every other optional dependency in this service.
- 30+ new tests: `test_training_coco.py`, `test_training_evaluate.py`,
  `test_training_registry_client.py` (against `httpx.MockTransport`,
  no real HTTP), `test_training_train_pipeline.py` (REQ-8.16, a fake
  `TrainerLike` — asserts the pipeline's shape/convention wiring into
  `OnnxDetectorAdapter` and that a placeholder export file reaches real
  `onnxruntime.InferenceSession` loading and fails there, not earlier),
  and `test_detection_factory.py` (the new registry-resolution path,
  fully monkeypatched).

### Known gap: `ultralytics`/`torch` could not be installed or run in this sandbox

Same class of network restriction as every prior phase's `uv sync`/
`prisma generate`/GitHub-release-CDN issues (see this file's Phase 4/5
Known gaps above): `ultralytics` pulls in `torch`, a multi-hundred-MB
dependency this sandbox cannot fetch. `_ultralytics_trainer.py` is
written and reviewed but has never actually trained or exported a real
model — the same "no real `.onnx` model" gap Phase 5 already documented,
now also covering the training side, not only inference. `train.py`'s
own orchestration logic (`run_training_pipeline()`,
`publish_training_run()`) is exercised for real via a fake `TrainerLike`
(REQ-8.16), and `registry_client.py`/`coco.py`/`evaluate.py` are fully
unit-tested without needing `ultralytics` at all — only the one file
that does the real training/export is unverified. `uv sync`/`uv lock`
must be re-run on a machine with network access to add `ultralytics`
and `httpx` (promoted from dev-only) to `uv.lock`, then a real training
run attempted against a real annotated dataset.

------------------------------------------------------------------------

## Related Notes

- [[PRD-Phase-1]] — REQ-1.5, REQ-1.13, REQ-1.14, REQ-1.15.
- [[PRD-Phase-3]] — REQ-3.8, REQ-3.9, REQ-3.11, REQ-3.13.
- [[PRD-Phase-4]] — REQ-4.1 through REQ-4.12.
- [[PRD-Phase-5]] — REQ-5.1 through REQ-5.12, all implemented this update.
- [[ADR-002-python-dependency-manager]] — why uv, and its Phase 1
  limitation above.
- [[ADR-005-event-schema-versioning]] — the versioning policy
  `events/envelope.py` implements.
- [[ADR-006-detection-model-and-tracker]] — the model, adapter
  interface, and tracker choices Phase 5 implements.
- [[Local_Kafka_Redpanda]] — the broker and topics this consumer reads
  from/writes to.
- [[MVP_Implementation_Plan]] — Phase 4 (Python and OpenCV Foundation),
  Phase 5 (AI Detection and Tracking).
- [[Architecture_Overview]] — the Python Vision Worker container this
  app implements.
- [[PRD-Phase-8]] — REQ-8.4 through REQ-8.10, REQ-8.16, implemented this update.
- [[ADR-008-experiment-tracking-and-dataset-versioning]] — the in-house tracking/versioning decision `registry_client.py`/`train.py` implement.
- [[ADR-009-annotation-format]] — the COCO JSON decision `training/coco.py` implements.
