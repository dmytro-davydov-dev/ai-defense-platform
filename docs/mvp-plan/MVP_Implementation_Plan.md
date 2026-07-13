---
title: MVP Implementation Plan
type: mvp-plan
tags: [mvp, roadmap, plan]
status: draft
---

# AI Defense Platform — MVP Implementation Plan

Version: 1.0
Status: Draft
Date: 2026-07-11

---

## Purpose

This document turns the MVP goals defined in `docs/vision/Goals.md` into an
actionable implementation plan. It maps the MVP to concrete phases of
`docs/roadmap/AI_Defense_Platform_Roadmap.md` and breaks each phase into
ordered, actionable next steps.

It does not replace the roadmap. The roadmap defines the long-term
15-phase strategy; this document scopes and sequences only the phases
needed to reach the MVP defined in Goals.md, and details the immediate
next steps for each.

---

# Part 1 — High-Level Plan

## What "MVP" means here

Per `Goals.md`, the MVP must demonstrate:

- mission creation and management;
- video upload;
- asynchronous processing;
- AI-based object detection and tracking;
- event-driven communication;
- interactive web interface;
- geospatial visualization;
- structured audit logging;
- local deployment with Docker Compose.

## MVP scope boundary

**In scope for MVP** — roadmap Phases 1–7:

| Phase | Name                                  | Why it's in the MVP                         |
| ----- | ------------------------------------- | ------------------------------------------- |
| 1     | Repository and Engineering Foundation | Nothing else can start without it           |
| 2     | Core Platform and Identity            | Mission CRUD, upload, audit baseline        |
| 3     | Kafka Event Platform                  | Event-driven processing is a named MVP goal |
| 4     | Python and OpenCV Foundation          | Vision runtime substrate for detection      |
| 5     | AI Detection and Tracking             | Named MVP goal (object detection/tracking)  |
| 6     | Frontend Mission Workspace            | Named MVP goal (interactive web interface)  |
| 7     | GIS and Telemetry (MVP slice only)    | Named MVP goal (geospatial visualization)   |

**Explicitly deferred past MVP** — roadmap Phases 8–15:

- Phase 8 (dataset registry, training pipeline, model lifecycle/MLOps);
- Phase 9 (edge runtime / Jetson deployment);
- Phase 10 (full security hardening: mTLS, threat model, SBOM, supply-chain controls — a _baseline_ subset ships inside Phases 1–3, see Cross-Cutting Concerns below);
- Phase 11 (full observability stack: Prometheus/Grafana/Loki/Tempo — structured logs and correlation IDs ship earlier, dashboards do not);
- Phase 12 (Kubernetes / GitOps — Docker Compose is the MVP deployment target per Goals.md);
- Phase 13 (full test-layer matrix — unit/integration/contract tests ship per-phase, load/resilience/security test suites do not);
- Phase 14 (production readiness: SLOs, DR, compliance evidence);
- Phase 15 (defense application modules built on top of the platform).

This mirrors the risk register's top entry — "Scope becomes too broad" —
whose mitigation is exactly this: enforce phased roadmap and MVP
boundaries.

## Sequencing and dependencies

```text
Phase 1 (Foundation)
   │
Phase 2 (Identity + Mission CRUD + Upload)
   │
Phase 3 (Kafka: Outbox, topics, consumers)
   │
   ├──────────────┐
   ▼              ▼
Phase 4        Phase 6 (Frontend can start once Phase 2 API
(Python/CV        exists; WebSocket/detection UI waits on
 foundation)       Phase 3/5 events)
   │
Phase 5 (Detection + Tracking)
   │
Phase 7 (GIS/Telemetry slice)
```

Phases 4 and 6 can run partially in parallel once Phase 2's API contracts
exist, but Phase 6's real-time and detection-overlay features are blocked
on Phase 3 (events) and Phase 5 (detections). Phase 7 depends on Phase 2
(mission data) and benefits from Phase 6's map container existing first.

## Cross-cutting concerns (woven through every phase, not a separate phase)

Per Guiding Principles ("Security by Design," "Observable by Default,"
"Testability by Design"), the following are **not deferred** to Phases
10/11/13 — a minimum viable version ships alongside each phase:

- **Security baseline**: JWT auth (Phase 2), no secrets in repo, signed
  storage URLs, least-privilege service accounts in Compose. Full OIDC,
  mTLS, and threat modeling remain Phase 10.
- **Observability baseline**: structured JSON logs, correlation ID
  propagation, health/readiness endpoints on every service (from Phase
  1 onward). Metrics dashboards and distributed tracing remain Phase 11.
- **Testing baseline**: unit tests for domain logic and integration
  tests for adapters (Postgres, Kafka, MinIO) ship in the same PR as the
  feature. Load, resilience and security test suites remain Phase 13.
- **ADRs**: every phase below lists the ADRs it must produce before
  implementation starts, per Coding_Standards.md's "significant
  architectural change" rule.

## Definition of Done for the MVP

The MVP is complete when:

- an operator can create a mission, upload a video, and watch it move
  through queued → processing → completed via the React workspace;
- the video is processed by the Python vision worker via Kafka commands
  (Transactional Outbox → Kafka → consumer), not a direct synchronous call;
- object detections and tracks are produced by a real model (YOLO via
  ONNX Runtime) against approved/synthetic classes only;
- detections render as overlays on the video and as points/routes on a
  map, with approximate geolocation clearly labeled as such;
- every mission-lifecycle action produces an immutable audit record;
- the entire stack starts with `docker compose up`;
- CI enforces lint, type-check, unit/integration tests, and build on
  every PR.

---

# Part 2 — Detailed Phase Plans (Next Steps)

## Phase 1 — Repository and Engineering Foundation

**Objective**: monorepo bootstrap, local dev environment, CI quality gates.

**ADRs to draft first**: monorepo tooling (Turborepo vs Nx vs plain
workspaces); Python dependency manager (uv vs Poetry); Kafka
distribution for local Compose (Confluent images vs Redpanda vs
Bitnami/KRaft).

**Next steps**:

1. Initialize `pnpm` (or `npm`) workspaces at the repo root; add the
   monorepo tool chosen in the ADR.
2. Scaffold `apps/web` (React + Vite + TS, empty shell), `apps/api`
   (NestJS, empty shell), `apps/vision-service` (Python + FastAPI, empty
   shell). Add `apps/outbox-publisher` and `apps/edge-agent` as empty
   stubs (implemented in Phase 3 and Phase 9 respectively).
3. Scaffold `packages/contracts`, `packages/event-schemas`,
   `packages/ts-config`, `packages/eslint-config`,
   `packages/observability` (stub).
4. Set up the Python workspace: `pyproject.toml`, Ruff, pytest, per the
   chosen dependency manager.
5. Write `infrastructure/compose/docker-compose.yml` wiring PostgreSQL +
   PostGIS, Kafka, MinIO, plus the three app shells.
6. Add `/health` and `/ready` endpoints to every service shell.
7. Configure ESLint + Prettier (TS) and Ruff (Python); add pre-commit
   hooks.
8. Configure GitHub Actions: lint → type-check → unit test → build →
   docker build, per service, gating on PR.
9. Document branch strategy and enforce Conventional Commits
   (commitlint) per Coding_Standards.md.
10. Add `.env.example` and startup config validation; confirm nothing
    secret is committed.
11. Update root `README.md` with local dev instructions
    (`docker compose up`, per-app dev commands).

**Deliverables / exit criteria**: `docker compose up` boots all shells;
every service answers `/health`; CI is green on a trivial PR.

---

## Phase 2 — Core Platform and Identity

**Objective**: mission lifecycle, identity, upload, audit baseline.

**ADRs to draft first**: NestJS ORM (Prisma vs TypeORM).

**Next steps**:

1. Define the mission state machine (draft → queued → processing →
   completed/failed) and document it under `docs/architecture/` (called
   out as a Sprint 0 backlog item that is not yet written).
2. Design the PostgreSQL schema (missions, users, teams, roles, audit
   log, outbox table placeholder for Phase 3) and write initial
   migrations via the chosen ORM.
3. Implement NestJS modules: `AuthModule` (JWT now, OIDC-compatible
   later), `MissionModule`, `UserModule`/`RoleModule` (RBAC).
4. Implement signed upload/download URL generation against MinIO via
   the S3 SDK.
5. Implement mission CRUD REST endpoints with OpenAPI generation and DTO
   validation.
6. Implement append-only audit event recording for every
   mission-lifecycle action and every auth event.
7. Expose Swagger UI for manual endpoint testing (the roadmap's "basic
   admin UI" is deferred to Phase 6's real frontend to avoid building a
   throwaway UI twice).
8. Write integration tests for the Postgres and MinIO adapters.

**Deliverables / exit criteria**: mission CRUD works end-to-end via
signed upload; RBAC enforced on endpoints; every mutating action leaves
an audit record; OpenAPI spec published.

---

## Phase 3 — Kafka Event Platform

**Objective**: asynchronous, reliable command/event delivery between API
and vision worker.

**ADRs to draft first**: event schema versioning/compatibility policy.

**Next steps**:

1. Stand up the Kafka distribution chosen in Phase 1's ADR inside
   Compose.
2. Create the topic taxonomy from the roadmap: `aidefense.commands`,
   `aidefense.processing-events`, `aidefense.detections`,
   `aidefense.telemetry`, `aidefense.audit`, `aidefense.device-events`,
   `aidefense.dead-letter`.
3. Define the event envelope (eventId, eventType, eventVersion,
   occurredAt, correlationId, causationId, producer, payload) per
   Coding_Standards.md, as JSON Schema in `packages/event-schemas`, with
   generated TS types and a matching Python/Pydantic model.
4. Implement the Transactional Outbox: an `outbox` table written in the
   same DB transaction as mission-state changes, plus `apps/outbox-publisher`
   polling and publishing to Kafka.
5. Implement the NestJS producer: mission submission writes a
   `MISSION_PROCESSING_REQUESTED` command via the outbox.
6. Use mission ID as the partition key to preserve per-mission ordering.
7. Implement idempotent consumption: a `processed_events` table checked
   before applying side effects, on both the API and vision-service
   sides.
8. Implement bounded retry with backoff and dead-letter publishing to
   `aidefense.dead-letter`.
9. Propagate correlation/causation IDs through HTTP and Kafka contexts
   (middleware + consumer interceptor).
10. Write integration tests for: duplicate delivery, consumer
    crash/restart mid-processing, DLQ routing.

**Deliverables / exit criteria**: a mission-processing command reaches a
consumer; duplicate delivery produces no duplicate side effects; failed
events land in the DLQ and are visible.

---

## Phase 4 — Python and OpenCV Foundation

**Objective**: a vision runtime substrate that does not yet depend on a
specific detection model.

**Next steps**:

1. Structure `apps/vision-service` as a typed Python package (`src`
   layout).
2. Implement OpenCV-based video/image readers with a bounded-memory
   frame-iteration generator (no unbounded frame accumulation, per
   Coding_Standards.md).
3. Implement preprocessing (resize/normalize) and annotation
   (bounding-box/label drawing) utilities.
4. Implement metadata extraction: duration, fps, resolution, checksum.
5. Add FastAPI `/health`, `/ready`, `/version` control endpoints.
6. Add structured JSON logging with correlation-ID propagation from the
   consumed Kafka message.
7. Define normalized Frame/Detection contracts as Pydantic models,
   mirroring `packages/event-schemas`.
8. Implement the Kafka consumer: on `MISSION_PROCESSING_REQUESTED`,
   download the source video from MinIO and iterate frames. No model
   inference yet — emit `PROCESSING_STARTED`/`PROCESSING_COMPLETED`
   progress events as a stub pipeline.
9. Write unit tests plus integration tests using a small synthetic
   fixture video (deterministic, checked into `samples/` if license/size
   permits, per Repository_Structure.md rules).

**Deliverables / exit criteria**: a mission command triggers real frame
iteration and progress events end-to-end, with no detection logic yet.

---

## Phase 5 — AI Detection and Tracking

**Objective**: real object detection and multi-object tracking, scoped
to civilian/synthetic classes only (safety constraint).

**ADRs to draft first**: model choice (e.g., YOLOv8n/YOLO11n for
CPU-friendly MVP inference) and the detector-adapter interface.

**Next steps**:

1. Define the detector adapter interface (input: frame; output:
   normalized detections) so the model is swappable without touching the
   pipeline, per the Technology Independence principle.
2. Export/convert the chosen YOLO model to ONNX; wire ONNX Runtime
   inference behind the adapter.
3. Implement configurable confidence thresholds and an explicit
   allow-list of object classes (civilian/synthetic only — excludes
   weapon guidance, target scoring, or engagement-relevant classes).
4. Integrate a tracker (ByteTrack or BoT-SORT) for multi-object tracking
   with track history.
5. Publish detections to `aidefense.detections` with bounding box,
   class, confidence, track ID, and frame timestamp.
6. Generate an annotated output video artifact and upload it to MinIO.
7. Capture inference metrics (per-frame latency, throughput) in
   structured logs, ready for Phase 11's dashboards later.
8. Build evaluation fixtures: a sample video with expected
   detection/track counts, checked via threshold-based tests (not exact
   match, since models are non-deterministic across environments).

**Deliverables / exit criteria**: uploaded video produces real
detections and tracks, published as events, with an annotated video
artifact in MinIO; only approved classes are ever emitted.

---

## Phase 6 — Frontend Mission Workspace

**Objective**: the operator-facing interactive web interface.

**Next steps**:

1. Scaffold the React app: Vite, TypeScript, Material UI, Redux Toolkit
   - RTK Query generated from the Phase 2 OpenAPI spec.
2. Build auth screens (login) against the JWT endpoints.
3. Build mission list and mission detail views.
4. Build the upload workflow (request signed URL → direct upload → show
   progress).
5. Add a NestJS WebSocket gateway that relays `aidefense.processing-events`
   and `aidefense.detections` to subscribed clients; wire the frontend to
   show live status.
6. Build a video player with detection-overlay rendering, synced to
   frame timestamps.
7. Build an event timeline component (processing milestones,
   detections, audit events).
8. Build basic filters and summary statistics (detections by class,
   mission duration, etc.).
9. Build an audit-trail view per mission.
10. Write one end-to-end test (Playwright/Cypress) covering: create
    mission → upload → observe live status → see detections rendered.

**Deliverables / exit criteria**: an operator can complete the full
mission → upload → review flow in the browser without touching the API
directly.

---

## Phase 7 — GIS and Telemetry (MVP slice)

**Objective**: minimum geospatial visualization named in the MVP goals —
full spatial-query/geofence capability is explicitly deferred to the
roadmap's full Phase 7 scope, post-MVP.

**Next steps**:

1. Add PostGIS geometry columns for mission routes/telemetry points.
2. Add a simple telemetry ingestion endpoint (CSV or GeoJSON upload) —
   no live sensor feed in the MVP.
3. Integrate MapLibre GL JS in the React app (chosen over Mapbox GL JS
   to avoid a mandatory paid token dependency for the reference
   implementation — confirm via a short ADR if this diverges from a
   future Mapbox-specific requirement).
4. Render the mission route and detection markers on the map.
5. Sync video scrubbing with map position (basic timeline sync, not full
   interpolation-based replay).
6. Visibly label all geolocation as approximate/estimated per the
   roadmap's constraint — never presented as verified targeting data.
7. Explicitly defer to post-MVP: geofences, full spatial queries,
   uncertainty-radius indicators, multi-mission overlay.

**Deliverables / exit criteria**: a mission's route and detections are
visible on a map, synced to the video, clearly marked as approximate.

---

# Summary: ADRs Required Before/During MVP

1. Monorepo tooling
2. Python dependency manager
3. Kafka distribution for local Compose
4. NestJS ORM
5. Event schema versioning/compatibility policy
6. Detection model choice and adapter interface
7. Map library choice (MapLibre vs Mapbox)

This satisfies Sprint 0's "at least five initial ADRs" exit criterion
and keeps decisions traceable per the Documentation-as-Code principle.

---

# Relationship to Other Documents

- [[Goals]] defines what "MVP" means; this document defines how to
  reach it.
- [[AI_Defense_Platform_Roadmap]] defines the full 15-phase strategy;
  this document scopes and sequences only Phases 1–7.
- [[Initial_Risk_Register]] risks are referenced inline where a phase
  directly mitigates one.
- Each phase's ADRs follow the template in [[ADR-000-template]].
- [[Guiding_Principles]] motivate the cross-cutting concerns above.
- [[Coding_Standards]] define the ADR trigger and testing expectations
  referenced throughout.

---

## Related Notes

- [[Vision]]
- [[Goals]]
- [[Guiding_Principles]]
- [[AI_Defense_Platform_Roadmap]]
- [[Sprint_0_Foundation]]
- [[Initial_Risk_Register]]
- [[Technology_Decisions]]
- [[PRD-Phase-1]] — Phase 1 expanded into full requirements.
