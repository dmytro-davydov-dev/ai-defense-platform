---
title: Local Kafka (Redpanda)
type: kafka
tags: [kafka, phase1]
status: accepted
---

# Local Kafka (Redpanda)

Phase 1 adds a Kafka-API-compatible broker to
`infrastructure/compose/docker-compose.yml` (REQ-1.16) purely so the
local stack has its full topology from day one — no topics, event
schemas, producers or consumers exist yet. That work is Phase 3
(`docs/mvp-plan/MVP_Implementation_Plan.md`).

## What exists today

- One `redpanda` service (Redpanda v24.3.1), Kafka API exposed on
  `19092` externally / `9092` internally, no separate ZooKeeper — see
  [[ADR-003-kafka-distribution-local-compose]] for the full rationale
  and alternatives considered (Bitnami Kafka KRaft, Confluent Platform).
- `packages/event-schemas` is an empty scaffold (REQ-1.10) — it exists
  so `apps/api`, `apps/outbox-publisher` and `apps/vision-service` have
  a shared import target from day one, but has no real schema content
  yet.

## What Phase 3 adds on top of this

- The topic taxonomy (`aidefense.commands`, `aidefense.processing-events`,
  `aidefense.detections`, `aidefense.telemetry`, `aidefense.audit`,
  `aidefense.device-events`, `aidefense.dead-letter`).
- The event envelope (`eventId`, `eventType`, `eventVersion`,
  `occurredAt`, `correlationId`, `causationId`, `producer`, `payload`)
  as JSON Schema in `packages/event-schemas`, per
  [[Coding_Standards]].
- The Transactional Outbox (`apps/outbox-publisher`) and idempotent
  consumption on both the API and vision-service sides.

------------------------------------------------------------------------

## Related Notes

- [[ADR-003-kafka-distribution-local-compose]] — the distribution
  choice and why it's reversible.
- [[PRD-Phase-1]] — REQ-1.10, REQ-1.16.
- [[MVP_Implementation_Plan]] — Phase 3 (Kafka Event Platform).
- [[Technology_Decisions]] — the platform-level commitment to Apache
  Kafka this local choice narrows.
