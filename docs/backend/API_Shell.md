---
title: API Shell
type: backend
tags: [backend, phase1, phase2]
status: accepted
---

# API Shell

`apps/api` — Phase 1 scaffolded the shell (`docs/mvp-plan/PRD-Phase-1.md`,
REQ-1.4); Phase 2 (`docs/mvp-plan/PRD-Phase-2.md`) is adding mission
CRUD, identity/RBAC, upload URLs and audit logging incrementally.

## What exists today

- NestJS 11 shell, scaffolded via `@nestjs/cli`.
- `AppController`/`AppService`: a placeholder root endpoint returning
  `{ service: "ai-defense-api", phase: 1 }`.
- `HealthController` (`src/health/health.controller.ts`): `/health` and
  `/ready`, both unconditionally 200 today since the shell has no
  dependencies yet (REQ-1.8). `/ready` will start checking real
  dependencies — Postgres, Kafka — once Phase 2/3 wire them in.
- Structured JSON logging via `@ai-defense/observability`'s `log()`
  helper on startup (see [[Observability_Baseline]]).
- `prisma/schema.prisma` + `prisma.config.ts` (REQ-2.1): the Phase 2
  data model (missions, users, teams, roles, audit_log, outbox) per
  [[ADR-004-nestjs-orm]]. Authored and reviewed against current Prisma 7
  docs; **not yet generated/migrated** — `prisma generate`/`migrate`
  need `binaries.prisma.sh`, unreachable from the sandbox this was built
  in. See `docs/roadmap/Progress.md` Known gaps for the exact follow-up
  command.
- `StorageModule` (`src/storage/`, REQ-2.9): signed MinIO upload/download
  URLs via `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`,
  `POST /storage/upload-url` and `GET /storage/download-url`. Creates its
  bucket (`MINIO_MISSIONS_BUCKET`) on startup if missing. **Temporarily
  unauthenticated** — see [[Security_Baseline]]; RBAC guard lands with
  `AuthModule` once Prisma is unblocked.
- Swagger UI at `/docs` (REQ-2.11) via `@nestjs/swagger`, plus a global
  `ValidationPipe` (whitelist, transform) so every future controller's
  DTOs are validated without remembering to wire it per-module.
- Jest unit tests + Supertest e2e tests covering `/`, `/health`,
  `/ready`, plus `StorageService` unit tests (URL shape, bucket
  creation) using `aws-sdk-client-mock` — no real MinIO needed to run
  them.
- Strict TypeScript (`@ai-defense/ts-config/node-app.json`) and shared
  ESLint config, with `@typescript-eslint/no-explicit-any` downgraded to
  a warning specifically for this app — Nest's DI/testing patterns
  (mocked providers, decorator metadata) regularly need `any`.

## What's deliberately not here yet

- No `AuthModule`, `MissionModule`, `UserModule`/`RoleModule`, or
  `AuditModule` — blocked on `prisma generate` succeeding somewhere with
  network access to `binaries.prisma.sh` (see Known gaps above), since
  all of them need the generated Prisma client.
- `StorageModule`'s routes are top-level (`/storage/...`) rather than
  mission-scoped, and unauthenticated — both temporary, closed out once
  `MissionModule`/`AuthModule` land.
- No Kafka producer — the outbox pattern and `apps/outbox-publisher`
  activate in Phase 3.

------------------------------------------------------------------------

## Related Notes

- [[PRD-Phase-1]] — REQ-1.4, REQ-1.8.
- [[PRD-Phase-2]] — REQ-2.1, REQ-2.9, REQ-2.11 implemented here so far.
- [[ADR-004-nestjs-orm]] — the Prisma schema referenced above.
- [[Security_Baseline]] — StorageModule's temporary unauthenticated gap.
- [[MVP_Implementation_Plan]] — Phase 2 (Core Platform and Identity)
  builds directly on this shell.
- [[Architecture_Overview]] — the NestJS Control Plane container this
  app implements.
- [[Observability_Baseline]] — the structured-logging helper this app
  consumes.
