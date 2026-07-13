---
title: Observability Baseline
type: observability
tags: [observability, phase1]
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
- `apps/vision-service` doesn't yet use a Python equivalent — FastAPI's
  default logging is untouched in Phase 1; a matching structured-logging
  helper is expected once Phase 4 adds real request/consumer volume
  worth structuring.
- `/health` and `/ready` on every app shell (REQ-1.8) — the other half
  of the Phase 1 observability baseline, covered per-app in
  [[Web_Shell]], [[API_Shell]], [[Vision_Service_Shell]].

## What's deliberately not here yet

- No OpenTelemetry SDK wiring, no trace exporter, no metrics.
- No correlation-ID middleware/interceptor actually propagating the
  constant through HTTP or Kafka contexts yet — that lands with Phase
  3's event envelope work (`correlationId`/`causationId` propagation is
  explicitly Phase 3 step 9).

------------------------------------------------------------------------

## Related Notes

- [[PRD-Phase-1]] — REQ-1.8, REQ-1.12.
- [[MVP_Implementation_Plan]] — "Observability baseline" cross-cutting
  concern; Phase 11 (full observability stack).
- [[API_Shell]] — the first real consumer of `packages/observability`.
