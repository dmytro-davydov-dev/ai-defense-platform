---
title: Vision Service Shell
type: python
tags: [python, phase1, phase3]
status: accepted
---

# Vision Service Shell

`apps/vision-service` started as a Phase 1 scaffold
(`docs/mvp-plan/PRD-Phase-1.md`, REQ-1.5, REQ-1.13-1.15) and gained a
real Kafka consumer in Phase 3 (`docs/mvp-plan/PRD-Phase-3.md`,
REQ-3.8/3.9/3.11/3.13). OpenCV frame handling still lands in Phase 4;
YOLO/ONNX Runtime detection and tracking land in Phase 5
(`docs/mvp-plan/MVP_Implementation_Plan.md`) — this service still does
no real frame processing.

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

## Known gap: `uv.lock` not yet committed

`uv.lock` could not be generated during Phase 1 implementation because
the sandbox environment used couldn't reach GitHub's release CDN (where
`uv` downloads its managed Python 3.12 build). Run `uv sync` once from a
machine with normal network access (or let CI's `astral-sh/setup-uv`
step do it) to generate and commit the lockfile before Phase 4 adds real
dependencies.

## What's deliberately not here yet

- No OpenCV, no video/frame handling, no model inference —
  `commands_consumer.py`'s `PROCESSING_STARTED`/`PROCESSING_COMPLETED`
  publish is an explicit stub (`note="stub: no frame processing in
  Phase 3"` in its payload); real frame iteration is Phase 4's step 8.
- `events/*.py` and `kafka/dead_letter.py`/`observability.py`
  deliberately use explicit `TypeVar`/`Generic` (not PEP 695 generic
  syntax) and `timezone.utc` (not the 3.11+ `datetime.UTC` alias),
  ignored via `pyproject.toml`'s `per-file-ignores` (`UP046`, `UP047`,
  `UP017`) — needed so these files stay parseable/importable under this
  sandbox's system Python 3.10, since `requires-python = ">=3.12"` but
  no 3.12 interpreter is reachable here (see the `uv.lock` gap above).
  Revisit once a real 3.12 environment verifies this codebase and the
  ignores can be dropped.
- REQ-3.15's integration tests exercising this service's consumer
  against a real broker/Postgres are written on the `apps/api` side
  (`apps/api/test/kafka-event-platform.e2e-spec.ts`) but not
  vision-service-specific — this service's Kafka code is covered by
  unit tests with fake `Pool`/`Producer` doubles only
  (`tests/test_retry.py`, `test_idempotency.py`,
  `test_commands_consumer.py`), consistent with [[Local_Kafka_Redpanda]]'s
  Known gaps (no docker in this sandbox).

------------------------------------------------------------------------

## Related Notes

- [[PRD-Phase-1]] — REQ-1.5, REQ-1.13, REQ-1.14, REQ-1.15.
- [[PRD-Phase-3]] — REQ-3.8, REQ-3.9, REQ-3.11, REQ-3.13.
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
