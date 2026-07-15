---
title: Edge Runtime
type: edge
tags: [edge, phase9]
status: accepted
---

# Edge Runtime

Phase 9 (`docs/mvp-plan/PRD-Phase-9.md`, REQ-9.1-9.18) is the first
grounded content under `docs/edge/` — Phases 1-8 had nothing here to
document beyond Phase 1's no-op `apps/edge-agent` stub. The language
and inference-strategy split is recorded in
[[ADR-010-edge-runtime-language-and-inference-strategy]]; device
identity and the synchronization transport in
[[ADR-011-device-identity-and-sync-transport]]. This note is the
domain-level summary of what actually runs; full module-by-module
detail lives alongside the code itself.

## Shape, in order

1. **Capture and detect** — `apps/edge-agent` spawns and supervises
   `apps/vision-service`'s `vision_service.edge.sidecar` as a child
   process (`python-sidecar.ts`'s `PythonSidecarProcess`). The sidecar
   is a thin wrapper: it reuses Phase 4's `VideoReader`, Phase 5's
   `OnnxDetectorAdapter`/`filter_detections`/`ALLOWED_CLASSES`/`Tracker`
   completely unchanged, and emits one JSON object per line on stdout
   (`{"type":"ready"}` / `{"type":"detection",...}` /
   `{"type":"error",...}`) — stdout is reserved exclusively for this
   protocol; all logging goes to stderr. `parseSidecarLine()` is the
   pure, independently-tested parser for the Node side of that
   contract.
2. **Buffer locally** — every detection and every
   `DEVICE_HEALTH_REPORTED` snapshot is appended to `event-buffer.ts`'s
   `EdgeEventBuffer`, a durable `node:sqlite` store keyed by `eventId`
   (idempotent append). Detections are retained via `appendLocalOnly()`
   — written for local inspection but never marked syncable (see "What's
   not real yet" below); health events are appended via the normal
   `append()` path and picked up by the sync loop.
3. **Synchronize** — `sync-client.ts`'s `runSyncCycle()` pulls the next
   unsynced batch (capped by configured event-count/byte budgets,
   always at least one row even if it alone exceeds the cap), POSTs it
   to `apps/api`'s `POST /edge/events` with this device's bearer token,
   and marks the batch synced only once the server confirms receipt.
   A network error or non-2xx response leaves every row unsynced for
   the next cycle — nothing is lost, nothing can be double-committed
   (idempotency is enforced server-side).
4. **Ingest** — `apps/api/src/edge/edge-events.service.ts` checks each
   event against the same `processed_events` idempotency table Phase 3
   introduced (REQ-3.8's pattern, reused verbatim), then republishes
   newly-accepted events through the existing generic `outbox` table —
   no second publishing path. This gives `DEVICE_HEALTH_REPORTED`
   events a real producer into `aidefense.device-events`, a topic
   Phase 3 declared but never populated.
5. **Resolve and deploy models** — `model-resolver.ts` periodically
   calls `GET /models/production` (Phase 8's registry) and, on a new
   production model, streams it to local disk and restarts the
   sidecar pointed at the new file. Promotion and rollback both flow
   through this same poll — no edge-side code change either way.

## Device identity

Every edge device is a row in the `edge_devices` table
(`EdgeDevice` in `schema.prisma`), created once via an admin-only
`POST /devices` that returns a plaintext bearer token exactly once; only
its SHA-256 hash is stored. `DeviceAuthGuard` verifies the
`Authorization: Bearer <token>` header against that hash;
`JwtOrDeviceAuthGuard` (tries JWT first, falls back to device auth) lets
the same credential also reach `GET /models/production` and
`GET /storage/download-url` — a device never needs an operator JWT for
anything. See [[ADR-011-device-identity-and-sync-transport]] for why
this is a deliberate stepping stone, not the platform's long-term
device-identity mechanism.

## What's not real yet

Edge detections are buffered locally but **not synchronized to the
cloud** in this pass — only `DEVICE_HEALTH_REPORTED` events flow
through `POST /edge/events`. Detections aren't mission-scoped, and the
existing `detections` table's `NOT NULL` mission foreign key doesn't
fit them without a real schema decision; left open deliberately rather
than guessed at. This is also why REQ-9.16's "prioritize
smaller/higher-value payloads" has nothing to rank between yet — there
is only one event type in flight. REQ-9.15's model download streams to
disk but has no chunking, resume, or throttling. No NVIDIA
Jetson/TensorRT hardware exists in this sandbox to validate
`DetectorAdapterLike`'s swappable-adapter interface with a real
TensorRT backend — see [[PRD-Phase-9]]'s Non-goals. See
[[Progress]]'s Phase 9 Known gaps for the full, current list.

------------------------------------------------------------------------

## Related Notes

- [[PRD-Phase-9]] — the requirements this note documents the implementation of.
- [[ADR-010-edge-runtime-language-and-inference-strategy]] — the Node-orchestrator/Python-sidecar decision record.
- [[ADR-011-device-identity-and-sync-transport]] — the device identity/sync transport decision record.
- [[Detection_And_Tracking]] — the exact Phase 5 pipeline this phase's sidecar reuses unchanged.
- [[PRD-Phase-8]] — the model registry this phase's model-resolution polls.
- [[Architecture_Overview]] — the Edge Runtime container this note grounds.
- [[Progress]] — Phase 9's checklist and Known gaps.
