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
  [[ADR-004-nestjs-orm]]. **Generated and migrated** (REQ-2.3): a real
  Prisma client exists at `apps/api/generated/` (gitignored, regenerate
  with `pnpm --filter @ai-defense/api exec prisma generate`) and the
  initial migration is committed at
  `apps/api/prisma/migrations/20260714093811_init/`. This sandbox still
  can't run `prisma generate`/`migrate` itself (network allowlist blocks
  `binaries.prisma.sh` — see Known gaps below); both artifacts were
  produced on a machine with normal network access, per the previous
  session's documented next step.
- `PrismaModule`/`PrismaService` (`src/prisma/`): global Nest module
  wrapping the generated client via the `@prisma/adapter-pg` driver
  adapter (`PrismaPg`), connecting/disconnecting on
  `onModuleInit`/`onModuleDestroy`. The only file that constructs
  `PrismaClient` directly — every feature module goes through a
  repository that injects `PrismaService`.
- `AuditModule` (`src/audit/`, REQ-2.10): `AuditService.record()` writes
  an append-only `audit_log` row (actor, action, target, mission,
  correlation id, metadata). No update/delete path exists. Accepts an
  optional `Prisma.TransactionClient` so a mission transition and its
  audit row land in the same DB transaction.
- `RolesModule`/`UsersModule` (`src/roles/`, `src/users/`, REQ-2.5):
  `RolesService` seeds the `operator`/`admin` roles on every boot
  (idempotent upsert, same pattern as `StorageService`'s bucket
  creation). `UsersService`/`UsersRepository` handle persistence only —
  password hashing lives in `AuthService`.
- `AuthModule` (`src/auth/`, REQ-2.4/2.5/2.6): `POST /auth/register` and
  `POST /auth/login` issue JWTs (`@nestjs/jwt`, bcrypt password hashing
  — 10 salt rounds, chosen over argon2 for zero extra native-build
  config; recorded here per PRD-Phase-2 §7 instead of a standalone ADR).
  `JwtStrategy` (`passport-jwt`) verifies tokens statelessly — the
  `roles` claim set at issuance is trusted for the token's lifetime, no
  per-request DB lookup. `JwtAuthGuard`/`RolesGuard` +
  `@Roles(...)`/`@CurrentUser()` decorators are reusable across
  controllers without importing `AuthModule` (guards resolve `Reflector`
  globally; the `jwt` passport strategy registers once at bootstrap).
  Every register/login attempt (success or failure) and every token
  issuance writes an audit record.
- `MissionsModule` (`src/missions/`, REQ-2.7/2.8): CRUD + state
  transitions. `mission-state-machine.ts` is pure domain logic (no
  Prisma/Nest import beyond the `MissionStatus` enum) implementing
  [[Mission_State_Machine]]'s legal-transition table — unit-tested in
  isolation per REQ-2.13. `MissionsService.transition()` is the only
  place `status` changes: check-then-write, re-validated inside the
  `$transaction` against the pre-read status (rejects
  `MISSION_STATE_CHANGED_CONCURRENTLY` on a race), audit row written in
  the same transaction. `POST /missions/:id/upload-url` wraps
  `StorageService` to issue a mission-scoped signed URL and record the
  object key on the mission — the mission-scoped route PRD-Phase-2 §6
  step 7 asked for, now that `MissionModule` exists.
- `StorageModule` (`src/storage/`, REQ-2.9): signed MinIO upload/download
  URLs via `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`,
  `POST /storage/upload-url` and `GET /storage/download-url`. Creates its
  bucket (`MINIO_MISSIONS_BUCKET`) on startup if missing. **No longer
  unauthenticated** — both routes now require `JwtAuthGuard` (upload
  additionally requires `RolesGuard` + `@Roles(operator, admin)`),
  closing the gap tracked in [[Security_Baseline]]. Routes remain
  top-level for non-mission-scoped use; prefer `MissionsController`'s
  upload-url route for a mission's own video.
- Swagger UI at `/docs` (REQ-2.11) via `@nestjs/swagger`, plus a global
  `ValidationPipe` (whitelist, transform) so every future controller's
  DTOs are validated without remembering to wire it per-module.
- Jest unit tests covering `/`, `/health`, `/ready`, `StorageService`,
  the mission state machine, `MissionsService`, `AuthService`,
  `RolesGuard`, and `AuditService` (52 tests total) — all mock the
  repository/Prisma layer, no real Postgres/MinIO needed to run them.
  Supertest e2e tests (`/`, `/health`, `/ready`) still exist but
  currently can't run under this app's Jest config — see Known gaps.
- Strict TypeScript (`@ai-defense/ts-config/node-app.json`) and shared
  ESLint config, with `@typescript-eslint/no-explicit-any` downgraded to
  a warning specifically for this app — Nest's DI/testing patterns
  (mocked providers, decorator metadata) regularly need `any`.

## What's deliberately not here yet

- REQ-2.12: the OpenAPI spec isn't yet exported into
  `packages/contracts` — Swagger UI at `/docs` is the only current
  consumer.
- REQ-2.14: integration tests against real Postgres/MinIO (Compose) —
  see Known gaps.
- No Kafka producer — the outbox pattern and `apps/outbox-publisher`
  activate in Phase 3.
- RBAC is two flat roles (`operator`, `admin`) with no per-role
  distinction in what they can do yet — an explicit Phase 2 MVP
  simplification per [[PRD-Phase-2]]'s open questions.

## Known gaps

- **This sandbox still can't run `prisma generate`/`migrate` itself**
  (network allowlist blocks `binaries.prisma.sh`, same as documented in
  `docs/roadmap/Progress.md` since Phase 2 started) — the committed
  generated client and migration were produced elsewhere. Regenerate
  locally with `pnpm --filter @ai-defense/api exec prisma generate`
  after any `schema.prisma` change.
- **The generated Prisma client requires Node 22.13+ at runtime.** It
  emits an `import.meta.url`-based `__dirname` shim (valid ESM); running
  it via plain CommonJS `require()` only works because Node 22+
  auto-detects ESM syntax in ambiguous `.js` files. `.nvmrc`, root
  `package.json`'s `engines.node`, `apps/api/Dockerfile`'s base images,
  and CI's `NODE_VERSION` were all bumped to match.
- **`pnpm run test:e2e` currently fails to even parse**, independent of
  DB availability: `ts-jest`'s CommonJS-mode transform can't handle the
  generated client's `import.meta.url` construct
  (`SyntaxError: Cannot use 'import.meta' outside a module`). This
  blocks REQ-2.14's integration tests even once run against a real
  Compose Postgres/MinIO — needs either a Jest ESM configuration
  (`extensionsToTreatAsEsm` + `--experimental-vm-modules`) or a
  different runner for e2e specs. Not attempted here; flagged for a
  follow-up. `pnpm test` (unit tests) works around it via
  `package.json`'s `jest.moduleNameMapper`, which redirects
  `generated/prisma/client` to `test/__mocks__/prisma-client.ts` — unit
  tests only, since every one of them mocks the repository/Prisma layer
  anyway. `test/jest-e2e.json` deliberately does **not** get the same
  stub: REQ-2.14 needs the real client's behavior once someone fixes the
  underlying ESM/ts-jest issue.

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
