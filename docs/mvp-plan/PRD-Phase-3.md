---
title: "PRD — Phase 3: Kafka Event Platform"
type: prd
tags: [mvp, prd, phase3]
status: draft
---

# PRD — Phase 3: Kafka Event Platform

Version: 1.0
Status: Draft
Date: 2026-07-14
Owner: Dmytro
Related documents: [[MVP_Implementation_Plan]], [[AI_Defense_Platform_Roadmap]], [[PRD-Phase-2]], [[Local_Kafka_Redpanda]], [[ADR-003-kafka-distribution-local-compose]], [[Coding_Standards]]

---

## 1. Summary

Phase 3 turns the Redpanda broker booted in Phase 1 (empty, no topics)
and the `outbox` table created in Phase 2 (columns only, nothing reads
it) into a working event platform: a topic taxonomy, a versioned event
envelope, a Transactional Outbox publisher, and idempotent consumption.
It does not add any vision/detection logic (Phase 4/5) or a real
consumer-side pipeline beyond acknowledging a command and emitting
stub progress events — `apps/vision-service` stays a thin consumer
until Phase 4 gives it real frame-processing work to do.

## 2. Problem statement

`apps/api` (Phase 2) can create and transition missions in Postgres,
but a `QUEUED` mission goes nowhere: there is no producer, no broker
topology beyond an empty Redpanda instance, and no consumer on the
other side. `packages/event-schemas` is an empty scaffold and the
`outbox` table (`apps/api/prisma/schema.prisma`, REQ-2.1) has no reader.
Every later MVP phase depends on this gap being closed: Phase 4's
vision-service worker needs a real command to react to,
`MissionsService.transition()` (REQ-2.8) needs a way to move
`QUEUED` → `PROCESSING` → `COMPLETED`/`FAILED` from events instead of
manual calls, and Phase 6's frontend needs live events to relay over
WebSocket. Without Phase 3, the platform's core "event-driven
processing" MVP goal (`docs/vision/Goals.md`) does not exist yet.

## 3. Goals

- A documented topic taxonomy covering commands, processing events,
  detections, telemetry, audit, device events, and dead-letter — per
  the roadmap's Phase 3 topic list.
- A versioned event envelope, defined once in `packages/event-schemas`
  as JSON Schema, with generated TypeScript types (for `apps/api`,
  `apps/outbox-publisher`) and a matching Pydantic model
  (`apps/vision-service`).
- A working Transactional Outbox: mission-state transitions
  (`MissionsService.transition()`, REQ-2.8) write to the `outbox` table
  in the same DB transaction, and `apps/outbox-publisher` polls and
  publishes those rows to Kafka, marking them published.
- Idempotent consumption on both sides of the broker (API and
  vision-service), via a `processed_events` table checked before any
  side effect runs.
- Bounded retry with backoff, and dead-letter routing to
  `aidefense.dead-letter` for events that exhaust retries.
- Correlation/causation IDs propagated end-to-end: HTTP request →
  outbox row → Kafka message → consumer log line, extending Phase 1's
  `packages/observability` correlation-ID baseline across the broker.
- Integration tests proving duplicate delivery, consumer crash/restart,
  and DLQ routing actually work against the Compose-provided Redpanda,
  not just unit-tested in isolation.

## 4. Non-goals (explicitly out of scope for Phase 3)

- Any real frame/video processing — `apps/vision-service`'s consumer
  downloads nothing and iterates no frames yet; it only proves the
  command arrives and emits stub `PROCESSING_STARTED`/
  `PROCESSING_COMPLETED` events (Phase 4 wires real frame iteration on
  top of the consumer this phase creates).
- Object detection, tracking, or any `aidefense.detections` payload
  content beyond the topic/schema existing (Phase 5).
- A Schema Registry — `ADR-003` explicitly deferred this; schema
  compatibility is enforced by versioned JSON Schema in
  `packages/event-schemas` and CI, not a runtime registry.
- WebSocket relay of events to the frontend (Phase 6 builds the
  NestJS WebSocket gateway consuming these same topics).
- A production (non-Redpanda) Kafka distribution — `ADR-003`'s review
  date is Phase 12.
- Full resilience/chaos test suites (partition loss, broker failover) —
  Phase 13.

## 5. Requirements

### 5.1 Topic taxonomy

- REQ-3.1: The seven topics from
  [[AI_Defense_Platform_Roadmap]] are created against the local
  Redpanda broker: `aidefense.commands`, `aidefense.processing-events`,
  `aidefense.detections`, `aidefense.telemetry`, `aidefense.audit`,
  `aidefense.device-events`, `aidefense.dead-letter`. Creation is
  scripted/declarative (not a manual one-off `rpk` command), so a fresh
  `docker compose up` reaches the same topology with no manual steps
  (consistent with REQ-1.17).
- REQ-3.2: Partition count and key strategy use the mission ID as the
  partition key on mission-scoped topics (`commands`,
  `processing-events`, `detections`), preserving per-mission ordering
  per the roadmap's Phase 3 capability list.

### 5.2 Event envelope and schema versioning

- REQ-3.3: The event envelope (`eventId`, `eventType`, `eventVersion`,
  `occurredAt`, `correlationId`, `causationId`, `producer`, `payload`)
  is defined as JSON Schema in `packages/event-schemas`, exactly per
  `Coding_Standards.md`'s Events section.
- REQ-3.4: TypeScript types are generated from the JSON Schema for
  `apps/api`/`apps/outbox-publisher` consumption, and a matching
  Pydantic model is hand-written (or generated) for
  `apps/vision-service`, kept in sync by a CI check, not by convention
  alone.
- REQ-3.5: An ADR documents the event schema versioning/compatibility
  policy (e.g. additive-only within a major `eventVersion`, breaking
  changes bump the version) — flagged as required in
  [[MVP_Implementation_Plan]]'s ADR summary.

### 5.3 Transactional Outbox

- REQ-3.6: `MissionsService.transition()` (REQ-2.8) writes one `outbox`
  row in the same Postgres transaction as the mission-state update,
  when the transition is `DRAFT` → `QUEUED` (producing
  `MISSION_PROCESSING_REQUESTED`).
- REQ-3.7: `apps/outbox-publisher` polls unpublished `outbox` rows
  (`published_at IS NULL`), publishes each as a Kafka message to
  `aidefense.commands` keyed by mission ID, and marks the row published
  only after a successful broker acknowledgment (at-least-once, not
  exactly-once — idempotent consumption, REQ-3.8, is what makes that
  safe).

### 5.4 Idempotent consumption

- REQ-3.8: Both `apps/api` (for events it consumes, e.g. from
  `aidefense.processing-events`) and `apps/vision-service` (for
  commands from `aidefense.commands`) check a `processed_events` table
  keyed by `eventId` before applying any side effect, and record the
  `eventId` after successful processing, per
  [[Initial_Risk_Register]]'s "duplicate events create side effects"
  entry.

### 5.5 Reliability: retry and dead-letter

- REQ-3.9: Consumers retry transient failures with bounded backoff
  (fixed retry count, not infinite); after exhausting retries, the
  message is published to `aidefense.dead-letter` with the original
  envelope plus a failure reason, and the original message is
  acknowledged (not redelivered forever).
- REQ-3.10: Dead-lettered messages are observable — at minimum, a
  structured log line per DLQ publish and a way to list/count DLQ
  messages (a documented `rpk` query is sufficient for the MVP; no
  dedicated UI required until later phases).

### 5.6 Correlation and causation

- REQ-3.11: The HTTP request's correlation ID
  (`packages/observability`'s `CORRELATION_ID_HEADER`, Phase 1) is
  carried into the `outbox` row, the Kafka message headers, and every
  consumer's structured log lines, so a single mission-processing
  request is traceable end-to-end across the broker.
- REQ-3.12: Every event a consumer produces sets `causationId` to the
  `eventId` of the event that triggered it, per
  `Coding_Standards.md`'s envelope shape.

### 5.7 Consumer-side stub pipeline

- REQ-3.13: `apps/vision-service` consumes `MISSION_PROCESSING_REQUESTED`
  from `aidefense.commands` and publishes
  `PROCESSING_STARTED`/`PROCESSING_COMPLETED` (or `PROCESSING_FAILED`)
  to `aidefense.processing-events` as a stub — no video download or
  frame iteration yet (that is Phase 4's REQ set).
- REQ-3.14: `apps/api` consumes `aidefense.processing-events` and calls
  `MissionsService.transition()` to move the mission from `QUEUED` to
  `PROCESSING` and on to `COMPLETED`/`FAILED`, closing the loop the
  roadmap's Phase 3 exit criteria describe.

### 5.8 Testing

- REQ-3.15: Integration tests run against the Compose-provided Redpanda
  and Postgres, covering: duplicate delivery of the same command
  produces no duplicate mission-state transition; a consumer
  crash/restart mid-processing resumes without data loss or duplicate
  side effects; an event that exhausts retries lands in
  `aidefense.dead-letter`.

## 6. Technical approach (ordered task list)

1. Draft and accept the event schema versioning/compatibility policy
   ADR (REQ-3.5) before touching `packages/event-schemas` content.
2. Define the event envelope as JSON Schema in
   `packages/event-schemas`; wire TS type generation and the matching
   Pydantic model; add the CI sync check (REQ-3.3/3.4).
3. Script topic creation (REQ-3.1/3.2) so it runs automatically against
   the Compose Redpanda instance.
4. Implement the Transactional Outbox write inside
   `MissionsService.transition()`'s existing DB transaction (REQ-3.6).
5. Implement `apps/outbox-publisher`: poll loop, publish to
   `aidefense.commands`, mark rows published (REQ-3.7).
6. Implement the `processed_events` idempotency check/record on both
   the vision-service consumer and the API consumer (REQ-3.8).
7. Implement bounded retry + dead-letter publishing on both consumers
   (REQ-3.9/3.10).
8. Propagate correlation/causation IDs through the outbox row, Kafka
   message headers, and consumer log context (REQ-3.11/3.12).
9. Implement the vision-service stub consumer
   (`MISSION_PROCESSING_REQUESTED` → `PROCESSING_STARTED`/
   `PROCESSING_COMPLETED`) and the API-side consumer that drives
   `MissionsService.transition()` off `aidefense.processing-events`
   (REQ-3.13/3.14).
10. Write integration tests for duplicate delivery, consumer
    crash/restart, and DLQ routing (REQ-3.15).
11. Update `docs/kafka/Local_Kafka_Redpanda.md` (status moves from
    "no topics yet" to real topology) and `docs/roadmap/Progress.md`.

## 7. ADRs required before/during Phase 3

1. Event schema versioning/compatibility policy — required per
   [[MVP_Implementation_Plan]]'s ADR summary; no ADR exists yet for
   this. Draft as `docs/adr/ADR-005-event-schema-versioning.md` (next
   available ADR number after `ADR-004-nestjs-orm`), using
   [[ADR-000-template]].

No other Phase-3-specific ADR is currently anticipated; the Kafka
distribution itself was already decided in
[[ADR-003-kafka-distribution-local-compose]] during Phase 1.

## 8. Success criteria / Definition of Done

- A mission submitted via `apps/api` (`DRAFT` → `QUEUED`) results in a
  `MISSION_PROCESSING_REQUESTED` command reaching
  `apps/vision-service` via the outbox → Kafka path, with no direct
  synchronous call between the two services.
- The mission's state advances to `PROCESSING` and then
  `COMPLETED`/`FAILED` purely from consumed events, matching
  [[Mission_State_Machine]]'s legal transitions.
- Publishing the same outbox row twice (simulated duplicate) produces
  exactly one mission-state transition, not two.
- Killing and restarting a consumer mid-processing does not lose the
  in-flight command or duplicate its side effects.
- An event that exhausts its retry budget is visible in
  `aidefense.dead-letter`, with a structured log line explaining why.
- A single correlation ID is traceable from the original HTTP request
  through the outbox row, the Kafka message, and every consumer log
  line touching that mission.
- Integration tests (REQ-3.15) pass against the Compose-provided
  Redpanda and Postgres in CI.

## 9. Dependencies

- Upstream: Phase 2 (`outbox` table, `MissionsService.transition()`,
  Postgres) and Phase 1 (Redpanda in Compose, `packages/event-schemas`
  scaffold, `packages/observability` correlation-ID baseline) — this
  phase cannot start meaningfully before both hold.
- Blocks: Phase 4 (Python and OpenCV Foundation), which extends this
  phase's stub vision-service consumer with real frame iteration;
  Phase 6 (Frontend Mission Workspace), whose WebSocket gateway relays
  the `aidefense.processing-events`/`aidefense.detections` topics this
  phase creates.

## 10. Risks

| Risk                                                                 | Mitigation                                                                                                    |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Outbox/event schema shape was guessed in Phase 2 before this phase's envelope existed | Revisit the `outbox` table's `payload` JSON shape now that the real envelope (REQ-3.3) exists; migrate if fields are missing |
| Kafka adds complexity before value (per [[Initial_Risk_Register]])  | Keep the consumer-side pipeline a deliberate stub (REQ-3.13) until Phase 4 gives it real work                 |
| Duplicate events create side effects (per [[Initial_Risk_Register]]) | `processed_events` idempotency table (REQ-3.8) checked before every side effect, tested via REQ-3.15           |
| Redpanda-vs-production-Kafka divergence (per [[ADR-003-kafka-distribution-local-compose]]) | All application code targets the standard Kafka client protocol only, never a Redpanda-specific API            |

(See also [[Initial_Risk_Register]] for platform-wide risks.)

## 11. Open questions

- Whether `apps/outbox-publisher` polls on a fixed interval or uses
  Postgres `LISTEN`/`NOTIFY` to reduce latency — deferred to
  implementation; either satisfies REQ-3.7, pick the simpler one first
  and revisit only if polling latency becomes a measured problem.
- Exact retry/backoff parameters (count, delay curve) for REQ-3.9 —
  start with a small fixed budget (e.g. 3 attempts, exponential
  backoff) and revisit once Phase 13's resilience testing exercises it
  under load.
- Whether `aidefense.telemetry`, `aidefense.audit`, and
  `aidefense.device-events` get real producers/consumers in this phase
  or are created empty (topic only) pending Phase 7/9/10 — current
  assumption is topics only; no producer/consumer work for these three
  is in scope until the phase that needs them.

---

## Relationship to other documents

- Derived from the "Phase 3 — Kafka Event Platform" section of
  [[MVP_Implementation_Plan]] and the roadmap's Phase 3 entry in
  [[AI_Defense_Platform_Roadmap]].
- Structure mirrors [[PRD-Phase-1]] and [[PRD-Phase-2]].
- Builds directly on the `outbox` table and mission state machine from
  [[PRD-Phase-2]] and the Redpanda broker from
  [[ADR-003-kafka-distribution-local-compose]]/[[Local_Kafka_Redpanda]].

---

## Related Notes

- [[MVP_Implementation_Plan]]
- [[AI_Defense_Platform_Roadmap]]
- [[PRD-Phase-2]]
- [[Local_Kafka_Redpanda]]
- [[ADR-003-kafka-distribution-local-compose]]
- [[Mission_State_Machine]]
- [[Coding_Standards]]
- [[Initial_Risk_Register]]
