---
title: Local Kafka (Redpanda)
type: kafka
tags: [kafka, phase1, phase3]
status: accepted
---

# Local Kafka (Redpanda)

Phase 1 added a Kafka-API-compatible broker to
`infrastructure/compose/docker-compose.yml` (REQ-1.16) with no topics,
event schemas, producers or consumers yet. Phase 3
(`docs/mvp-plan/PRD-Phase-3.md`) builds the real event platform on top
of that broker: topic taxonomy, event envelope, Transactional Outbox,
idempotent consumption, retry/dead-letter, and correlation/causation
propagation.

## What exists today

- One `redpanda` service (Redpanda v24.3.1), Kafka API exposed on
  `19092` externally / `9092` internally, no separate ZooKeeper — see
  [[ADR-003-kafka-distribution-local-compose]] for the full rationale
  and alternatives considered (Bitnami Kafka KRaft, Confluent Platform).
- A `kafka-init` one-shot Compose service
  (`infrastructure/kafka/create-topics.sh`, driven by
  `infrastructure/kafka/topics.json`) declaratively creates the seven
  `aidefense.*` topics via `rpk topic create` against the `redpanda`
  service, idempotently, before `api`/`vision-service`/
  `outbox-publisher` are allowed to start (REQ-3.1).
- The topic taxonomy (`packages/event-schemas/src/topics.ts`'s
  `TOPICS`): `aidefense.commands`, `aidefense.processing-events`,
  `aidefense.detections`, `aidefense.telemetry`, `aidefense.audit`,
  `aidefense.device-events`, `aidefense.dead-letter`. The first three
  are mission-scoped and partitioned by mission ID (REQ-3.2,
  `MISSION_SCOPED_TOPICS`).
- The event envelope (`eventId`, `eventType`, `eventVersion`,
  `occurredAt`, `correlationId`, `causationId`, `producer`, `payload`)
  as JSON Schema in `packages/event-schemas/src/schemas/`, mirrored by
  TS types (`envelope.ts`) and a Pydantic model
  (`apps/vision-service/src/vision_service/events/envelope.py`), kept
  in sync via `apps/vision-service/tests/test_event_schema_sync.py`
  (REQ-3.3/3.4). Versioning policy: [[ADR-005-event-schema-versioning]]
  (additive-only, per-eventType integer version, no Schema Registry).
- The Transactional Outbox: `MissionsService.transition()` writes one
  `outbox` row in the same DB transaction as a DRAFT→QUEUED mission
  transition (REQ-3.6); `apps/outbox-publisher` polls unpublished rows
  (`SELECT ... FOR UPDATE SKIP LOCKED`) and publishes them to Kafka,
  reusing the row's own `eventId`/`correlationId`/`causationId` so
  redelivery keeps the same identity (REQ-3.7).
- Idempotent consumption on both sides: a `processed_events` table,
  unique on `(event_id, consumer)`, checked via an
  `INSERT ... ON CONFLICT DO NOTHING` before any side effect runs
  (`apps/api/src/processed-events/`,
  `apps/vision-service/src/vision_service/kafka/idempotency.py`) —
  REQ-3.8.
- Bounded retry with exponential backoff (3 attempts) wraps every
  consumer's side effect on both sides
  (`apps/api/src/kafka/retry.util.ts`,
  `apps/vision-service/src/vision_service/kafka/retry.py`); exhausting
  the budget publishes a `EVENT_DEAD_LETTERED` envelope to
  `aidefense.dead-letter` carrying the original event, failure reason,
  attempt count, and originating topic (REQ-3.9/3.10).
- Correlation ID flows from the HTTP request that queued a mission,
  through the outbox row, into the Kafka envelope's `correlationId`,
  and into every consumer's structured log line; each produced event's
  `causationId` is set to the `eventId` of whatever triggered it
  (REQ-3.11/3.12).
- Consumer-side stub pipeline: `apps/vision-service`'s
  `commands_consumer.py` consumes `aidefense.commands` and publishes a
  stub `PROCESSING_STARTED` then `PROCESSING_COMPLETED` (no real frame
  processing until Phase 4/5); `apps/api`'s
  `processing-events.handler.ts` consumes `aidefense.processing-events`
  and drives `MissionsService.transition()` off them (REQ-3.13/3.14).

## Known gaps

- REQ-3.15's integration tests
  (`apps/api/test/kafka-event-platform.e2e-spec.ts`) are written —
  duplicate delivery, simulated consumer crash/restart, and a real
  broker DLQ round-trip — but not yet run: this sandbox has no docker
  daemon, so there's no live Redpanda/Postgres/MinIO to run them
  against. Run with `docker compose -f
  infrastructure/compose/docker-compose.yml up -d postgres redpanda
  kafka-init minio` and `DATABASE_URL`/`KAFKA_BROKERS`/
  `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` exported, then
  `pnpm --filter @ai-defense/api run test:e2e`, on a machine with
  docker. No CI job runs this yet either — wiring one is follow-up
  work, same as REQ-2.14's still-open CI wiring.
- `aidefense.telemetry`, `aidefense.audit`, and `aidefense.device-events`
  are created (REQ-3.1) but have no producer or consumer yet — deferred
  to the phase that needs them, per [[PRD-Phase-3]]'s open questions.

------------------------------------------------------------------------

## Related Notes

- [[ADR-003-kafka-distribution-local-compose]] — the distribution
  choice and why it's reversible.
- [[ADR-005-event-schema-versioning]] — the envelope versioning policy.
- [[PRD-Phase-1]] — REQ-1.10, REQ-1.16.
- [[PRD-Phase-3]] — REQ-3.1–3.15, the full event platform requirements.
- [[Vision_Service_Shell]] — the Python-side consumer/idempotency code.
- [[Observability_Baseline]] — correlation ID propagation into Kafka.
- [[Technology_Decisions]] — the platform-level commitment to Apache
  Kafka this local choice narrows.
