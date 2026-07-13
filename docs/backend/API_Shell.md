---
title: API Shell
type: backend
tags: [backend, phase1]
status: accepted
---

# API Shell

`apps/api` — Phase 1 scaffold only (`docs/mvp-plan/PRD-Phase-1.md`,
REQ-1.4). Mission CRUD, identity/RBAC, upload URLs and audit logging are
built in Phase 2 (`docs/mvp-plan/MVP_Implementation_Plan.md`).

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
- Jest unit tests + Supertest e2e tests covering `/`, `/health`,
  `/ready`.
- Strict TypeScript (`@ai-defense/ts-config/node-app.json`) and shared
  ESLint config, with `@typescript-eslint/no-explicit-any` downgraded to
  a warning specifically for this app — Nest's DI/testing patterns
  (mocked providers, decorator metadata) regularly need `any`.

## What's deliberately not here yet

- No modules beyond the placeholder root controller and health checks —
  no `AuthModule`, `MissionModule`, `UserModule`/`RoleModule` (Phase 2).
- No database connection, no ORM choice made yet (Prisma vs TypeORM is
  Phase 2's required ADR).
- No Kafka producer — the outbox pattern and `apps/outbox-publisher`
  activate in Phase 3.

------------------------------------------------------------------------

## Related Notes

- [[PRD-Phase-1]] — REQ-1.4, REQ-1.8.
- [[MVP_Implementation_Plan]] — Phase 2 (Core Platform and Identity)
  builds directly on this shell.
- [[Architecture_Overview]] — the NestJS Control Plane container this
  app implements.
- [[Observability_Baseline]] — the structured-logging helper this app
  consumes.
