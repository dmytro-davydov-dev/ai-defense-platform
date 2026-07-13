---
title: "PRD — Phase 2: Core Platform and Identity"
type: prd
tags: [mvp, prd, phase2]
status: draft
---

# PRD — Phase 2: Core Platform and Identity

Version: 1.0
Status: Draft
Date: 2026-07-13
Owner: Dmytro
Related documents: [[MVP_Implementation_Plan]], [[AI_Defense_Platform_Roadmap]], [[PRD-Phase-1]], [[ADR-004-nestjs-orm]]

---

## 1. Summary

Phase 2 turns `apps/api` from an empty NestJS shell (Phase 1) into a
real control plane: mission lifecycle, identity/RBAC, signed video
upload against MinIO, and an immutable audit trail. It produces the
first real database schema and the first authenticated endpoints. It
does not wire Kafka (Phase 3), detection (Phase 5), or a real frontend
(Phase 6) — Swagger UI is the only "UI" this phase ships.

## 2. Problem statement

`apps/api` today (Phase 1) is a placeholder root controller plus
`/health`/`/ready` — no database connection, no modules, no auth. Every
later MVP phase needs a real mission entity to attach to: Phase 3's
outbox writes mission-state transitions, Phase 4/5's vision worker
processes missions created here, Phase 6's frontend calls this API's
endpoints directly, and Phase 7's PostGIS columns extend this same
`missions` table. Without Phase 2, there is no authenticated, persistent
mission concept for any of those phases to build on.

## 3. Goals

- A persistent mission lifecycle (draft → queued → processing →
  completed/failed) backed by PostgreSQL.
- JWT-based authentication and role-based authorization (RBAC) on every
  mutating endpoint.
- Signed upload/download URLs against MinIO so video bytes never
  transit through `apps/api`.
- An append-only audit record for every mission-lifecycle action and
  every auth event.
- A published OpenAPI spec that `packages/contracts` and Phase 6's
  frontend can consume directly.
- Integration tests proving the Postgres and MinIO adapters actually
  work, not just unit-tested in isolation.

## 4. Non-goals (explicitly out of scope for Phase 2)

- Kafka producers/consumers, the transactional outbox's actual
  publishing step, or `apps/outbox-publisher` becoming non-empty
  (Phase 3 — the outbox *table* is created here, but nothing reads it
  yet).
- Any video/frame processing (Phase 4/5).
- Any UI beyond Swagger UI (Phase 6 builds the real frontend against
  this phase's OpenAPI spec).
- Full OIDC federation, mTLS, or a formal threat model (Phase 10) — JWT
  issued/verified by `apps/api` itself is sufficient for Phase 2.
- Full observability stack — dashboards, tracing (Phase 11); this phase
  only extends the Phase 1 structured-logging/correlation-ID baseline to
  its new endpoints.

## 5. Requirements

### 5.1 Data model and migrations

- REQ-2.1: PostgreSQL schema defined via the ORM selected in
  [[ADR-004-nestjs-orm]] (Prisma): `missions`, `users`, `teams`, `roles`
  (+ join table for user-role assignment), `audit_log`, and an `outbox`
  table (columns only — Phase 3 wires the publisher).
- REQ-2.2: The mission state machine (`draft` → `queued` → `processing`
  → `completed` | `failed`) is documented under `docs/architecture/`
  and enforced at the application-service layer (illegal transitions
  rejected, not just modeled as a free-text column).
- REQ-2.3: Initial migrations are committed and re-runnable against a
  fresh database with no manual steps beyond `prisma migrate deploy`.

### 5.2 Identity and authorization

- REQ-2.4: `AuthModule` issues and verifies JWTs (login endpoint,
  password hashing via bcrypt/argon2 — algorithm choice recorded inline
  in the module, not a separate ADR).
- REQ-2.5: `UserModule`/`RoleModule` implement RBAC with at least two
  roles (`operator`, `admin`) enforced via a Nest guard on every
  mutating endpoint.
- REQ-2.6: Every authentication event (login success/failure, token
  issuance) produces an audit record (REQ-2.10).

### 5.3 Mission lifecycle

- REQ-2.7: `MissionModule` implements mission CRUD (create, get, list,
  update metadata, transition state) as REST endpoints with DTO
  validation (`class-validator`) on every input.
- REQ-2.8: State transitions go through a dedicated application service
  method (not direct field updates), enforcing REQ-2.2's state machine
  and producing an audit record per transition.

### 5.4 Upload and storage

- REQ-2.9: Signed upload/download URL generation against MinIO via the
  S3 SDK — `apps/api` never proxies video bytes; it only issues
  time-limited signed URLs the client uses directly.

### 5.5 Audit baseline

- REQ-2.10: An `AuditModule` (or equivalent shared service) writes an
  append-only record for every mission-lifecycle action and every auth
  event, including actor, action, target, timestamp, and correlation ID
  (per `packages/observability`'s `CORRELATION_ID_HEADER`, Phase 1).
  Audit records are never updated or deleted via the API surface.

### 5.6 API surface and documentation

- REQ-2.11: OpenAPI spec is generated from the NestJS controllers
  (`@nestjs/swagger` decorators) and published at a `/docs` (Swagger UI)
  endpoint for manual testing.
- REQ-2.12: The generated OpenAPI spec is exported to
  `packages/contracts` in a form Phase 6's frontend can generate an
  RTK Query client from.

### 5.7 Testing

- REQ-2.13: Unit tests cover the mission state machine and RBAC guard
  logic in isolation.
- REQ-2.14: Integration tests run against a real Postgres (Compose) and
  real MinIO (Compose), covering: mission CRUD round-trip, signed URL
  generation, and at least one illegal-state-transition rejection.

## 6. Technical approach (ordered task list)

1. Draft and accept [[ADR-004-nestjs-orm]] (Prisma vs TypeORM) — done;
   see that ADR for the decision and PostGIS caveat.
2. Document the mission state machine under `docs/architecture/`
   (REQ-2.2).
3. Model the schema in `apps/api/prisma/schema.prisma`: `missions`,
   `users`, `teams`, `roles`, `user_roles`, `audit_log`, `outbox`; run
   the initial migration.
4. Implement `AuthModule` (JWT issuance/verification, password hashing)
   and a Nest guard consuming it.
5. Implement `UserModule`/`RoleModule` and wire the RBAC guard into
   every mutating route.
6. Implement `MissionModule`: DTOs, controller, application service
   enforcing the state machine, repository hiding Prisma calls.
7. Implement signed upload/download URL generation against MinIO (S3
   SDK), exposed via a `MissionModule` endpoint (e.g.
   `POST /missions/:id/upload-url`).
8. Implement `AuditModule` and call it from every mission-lifecycle
   transition and every auth event.
9. Add `@nestjs/swagger` decorators across controllers; expose Swagger
   UI at `/docs`; export the OpenAPI spec into `packages/contracts`.
10. Write unit tests (state machine, RBAC guard) and integration tests
    (Postgres, MinIO adapters) per REQ-2.13/2.14.
11. Update `docs/backend/API_Shell.md` (status moves from Phase 1
    scaffold to Phase 2 real implementation) and `docs/roadmap/Progress.md`.

## 7. ADRs required before/during Phase 2

1. NestJS ORM (Prisma vs TypeORM) — see [[ADR-004-nestjs-orm]] (drafted
   as part of this PRD; status: proposed, pending acceptance before
   REQ-2.1 implementation begins).

No other Phase-2-specific ADR is currently anticipated; password hashing
algorithm and JWT library choice are implementation details recorded
inline in `AuthModule`'s code/README rather than a standalone ADR, per
`Coding_Standards.md`'s "significant architectural change" threshold.

## 8. Success criteria / Definition of Done

- An operator can register/login, create a mission, request a signed
  upload URL, and transition the mission through its full state machine
  via REST calls (Swagger UI or `curl`), with RBAC enforced on every
  mutating call.
- Every mutating action (mission transition, login, upload URL issuance)
  leaves an audit record queryable by mission ID or actor.
- `GET /docs` serves a Swagger UI reflecting the real OpenAPI spec, and
  the same spec is exported into `packages/contracts`.
- Integration tests pass against the Compose-provided Postgres and
  MinIO instances in CI.
- No secrets are hardcoded; JWT signing secret and MinIO credentials
  come from `.env` per the Phase 1 baseline.

## 9. Dependencies

- Upstream: Phase 1 (`apps/api` shell, Postgres/MinIO in Compose, CI
  gates) — this phase cannot start meaningfully before Phase 1's exit
  criteria hold.
- Blocks: Phase 3 (Kafka Event Platform), which publishes from the
  `outbox` table this phase creates; Phase 6 (Frontend Mission
  Workspace), which consumes this phase's OpenAPI spec directly; Phase
  7 (GIS/Telemetry), which extends the `missions` table with PostGIS
  columns.

## 10. Risks

| Risk                                                              | Mitigation                                                                                   |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Outbox table shape guessed wrong before Phase 3 defines the event envelope | Keep the outbox schema minimal (id, aggregate type/id, payload, created_at, published_at nullable); revisit alongside Phase 3's event envelope work if fields are missing |
| RBAC modeled too simply (two roles) undersells later access-control needs | Document as an explicit MVP simplification; Phase 10 (full OIDC/ABAC) is where finer-grained authorization lands |
| Prisma's `Unsupported` PostGIS escape hatch (ADR-004) turns out too limiting once Phase 7 needs real spatial queries | Flagged already in ADR-004's review date at the start of Phase 7 |

(See also [[Initial_Risk_Register]] for platform-wide risks.)

## 11. Open questions

- Exact RBAC role set beyond `operator`/`admin` (e.g., a read-only
  `viewer` role) — deferred until Phase 6's frontend surfaces a concrete
  need.
- Whether audit records live in the same Postgres database/schema as
  application data or a separate append-only store — Phase 2 assumes
  same database, same schema, revisited only if compliance requirements
  (Phase 10/14) demand isolation.

---

## Relationship to other documents

- Derived from the "Phase 2 — Core Platform and Identity" section of
  [[MVP_Implementation_Plan]].
- Exit criteria align with Phase 2 in [[AI_Defense_Platform_Roadmap]].
- Structure mirrors [[PRD-Phase-1]], adapted for Phase 2's requirements.
- ORM decision detailed in [[ADR-004-nestjs-orm]].

---

## Related Notes

- [[MVP_Implementation_Plan]]
- [[AI_Defense_Platform_Roadmap]]
- [[PRD-Phase-1]]
- [[ADR-004-nestjs-orm]]
- [[API_Shell]]
- [[Coding_Standards]]
- [[Initial_Risk_Register]]
