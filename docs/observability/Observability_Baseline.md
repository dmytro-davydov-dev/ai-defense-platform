---
title: Observability Baseline
type: observability
tags: [observability, phase1, phase3]
status: accepted
---

# Observability Baseline

Per the "Observability baseline" cross-cutting concern in
`docs/mvp-plan/MVP_Implementation_Plan.md`: structured JSON logs,
correlation-ID propagation, and health/readiness endpoints ship from
Phase 1 onward on every service. Metrics dashboards and distributed
tracing (Prometheus/Grafana/Loki/Tempo) remain Phase 11.

## What exists today

- `packages/observability` (REQ-1.12): a stub package providing
  `log(level, message, fields)` — a minimal structured JSON logger (one
  JSON object per line, stable shape) — and the
  `CORRELATION_ID_HEADER` (`x-correlation-id`) constant that later
  middleware/interceptors will read and propagate, rather than
  hardcoding the header name per call site.
- `apps/api` consumes `log()` on startup; `apps/outbox-publisher` and
  `apps/edge-agent` use it in their stub `main.ts` entrypoints too, so
  the pattern is already exercised everywhere it'll matter, even before
  those services do real work.
- `apps/vision-service` now has a Python equivalent —
  `src/vision_service/observability.py` mirrors `packages/observability`'s
  `log()`/`CORRELATION_ID_HEADER` exactly (same JSON shape), added in
  Phase 3 ahead of its original Phase 4 estimate because REQ-3.11
  requires every Kafka consumer's log lines to carry `correlationId`
  from day one.
- `/health` and `/ready` on every app shell (REQ-1.8) — the other half
  of the Phase 1 observability baseline, covered per-app in
  [[Web_Shell]], [[API_Shell]], [[Vision_Service_Shell]].

## Phase 3: correlation ID actually propagates now

- REQ-3.11/3.12 close the gap flagged below in the Phase 1 version of
  this note: `correlationId` now flows from the HTTP request that
  queues a mission, through the `outbox` row
  (`apps/api/src/outbox/outbox.repository.ts`), into the Kafka
  envelope's `correlationId` field, and into every consumer's
  structured log line on both `apps/api`
  (`src/kafka/processing-events.handler.ts`) and `apps/vision-service`
  (`src/vision_service/kafka/commands_consumer.py`).
- Every produced event's `causationId` is set to the `eventId` of
  whatever triggered it — the first event in a chain (an HTTP-triggered
  outbox row) has `causationId: null`; every event a consumer produces
  in response sets `causationId` to the `eventId` it was reacting to.
  Dead-lettered envelopes (`dead-letter.ts`/`dead_letter.py`) carry the
  full original envelope plus `attempts`/`failureReason`/`topic`, so a
  dead-lettered message is fully traceable back to its trigger.
- This is still log-based correlation, not distributed tracing — no
  OpenTelemetry spans connect a request to the Kafka messages it
  produced. That remains Phase 11.

## What's deliberately not here yet

- No OpenTelemetry SDK wiring, no trace exporter, no metrics.
- `aidefense.telemetry`/`aidefense.audit`/`aidefense.device-events`
  topics exist (Phase 3's topic taxonomy) but have no producer/consumer
  — this note's "observability baseline" is about the platform's own
  logs, not those topics' eventual telemetry payloads.

------------------------------------------------------------------------

## Related Notes

- [[PRD-Phase-1]] — REQ-1.8, REQ-1.12.
- [[PRD-Phase-3]] — REQ-3.11, REQ-3.12.
- [[Local_Kafka_Redpanda]] — where correlation/causation IDs travel
  through the event envelope.
- [[MVP_Implementation_Plan]] — "Observability baseline" cross-cutting
  concern; Phase 11 (full observability stack).
- [[API_Shell]] — the first real consumer of `packages/observability`.
- [[Vision_Service_Shell]] — the Python mirror added in Phase 3.
