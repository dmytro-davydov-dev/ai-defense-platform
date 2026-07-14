---
title: Vision Service Shell
type: python
tags: [python, phase1, phase3, phase4]
status: accepted
---

# Vision Service Shell

`apps/vision-service` started as a Phase 1 scaffold
(`docs/mvp-plan/PRD-Phase-1.md`, REQ-1.5, REQ-1.13-1.15), gained a real
Kafka consumer in Phase 3 (`docs/mvp-plan/PRD-Phase-3.md`,
REQ-3.8/3.9/3.11/3.13), and gained real OpenCV frame processing in
Phase 4 (`docs/mvp-plan/PRD-Phase-4.md`, REQ-4.1-4.12): the consumer
now downloads the mission's video from MinIO, extracts real metadata,
and iterates every frame — still no detection model, that's Phase 5
(`docs/mvp-plan/MVP_Implementation_Plan.md`).

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

## What's deliberately not here yet

- No model inference, no real `Detection` values — `Detection`'s
  fields exist (REQ-4.9) but nothing populates them; YOLO/ONNX Runtime
  wiring is Phase 5.
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
  `apps/vision-service/tests/`'s full suite (58 tests as of this
  update, including Phase 4's new video/image/metadata/annotation/
  preprocessing/minio-client/ready-dependency modules) and `ruff
  check`/`ruff format --check` were verified against this sandbox's
  system Python 3.10 — a real Python 3.12 + Docker run of the full
  Compose stack (per REQ-4.12's DoD) is still open.

------------------------------------------------------------------------

## Related Notes

- [[PRD-Phase-1]] — REQ-1.5, REQ-1.13, REQ-1.14, REQ-1.15.
- [[PRD-Phase-3]] — REQ-3.8, REQ-3.9, REQ-3.11, REQ-3.13.
- [[PRD-Phase-4]] — REQ-4.1 through REQ-4.12, all implemented this update.
- [[ADR-002-python-dependency-manager]] — why uv, and its Phase 1
  limitation above.
- [[ADR-005-event-schema-versioning]] — the versioning policy
  `events/envelope.py` implements.
- [[Local_Kafka_Redpanda]] — the broker and topics this consumer reads
  from/writes to.
- [[MVP_Implementation_Plan]] — Phase 4 (Python and OpenCV Foundation),
  Phase 5 (AI Detection and Tracking).
- [[Architecture_Overview]] — the Python Vision Worker container this
  app implements.
