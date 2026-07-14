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
  session's documented next step. The `generator client` block now sets
  `moduleFormat = "cjs"` explicitly (fix for the ESM/CJS incompatibility
  in Known gaps below) — **the committed `apps/api/generated/` client
  predates this change** and needs regenerating before it reflects it.
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

- REQ-2.14: integration tests are written (`apps/api/test/mission-
  lifecycle.e2e-spec.ts`) but not yet run against real Postgres/MinIO
  (Compose) — see Known gaps. (REQ-2.12's export tooling is done — see
  Known gaps below — `packages/contracts/openapi.json` is real and
  committed.)
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
  underlying ESM/ts-jest issue. **Update:** the `import.meta.url`
  `SyntaxError` did disappear once `moduleFormat = "cjs"` (see below)
  was regenerated, but a *second*, unrelated `ts-jest` issue surfaced
  next: `Cannot find module './internal/class.js' from
  '../generated/prisma/client.ts'` — Prisma's generator writes its own
  internal imports in NodeNext style (explicit `.js` pointing at a
  sibling `.ts` file, valid for a real `tsc` build), which `ts-jest`'s
  on-the-fly transform can't resolve without help. Fixed with the
  standard workaround — added `"moduleNameMapper": {
  "^(\\.{1,2}/.*)\\.js$": "$1" }` to `test/jest-e2e.json` — not yet
  re-run to confirm.
- **This is worse than previously documented: it also breaks plain
  `node`, not just Jest.** Discovered in a prior session while building
  REQ-2.12's export script — `apps/api/generated/prisma/client.ts` ships
  raw TypeScript (Prisma 7's generator), and an `import.meta.url` line
  inside it survived `tsc`'s `nodenext` compile into
  `dist/generated/prisma/client.js` regardless of how it's invoked.
  Requiring that compiled file directly under Node v22.22.3 (this
  sandbox's current version — floating past the `.nvmrc`-pinned
  `22.13.0`) threw `ReferenceError: exports is not defined in ES module
  scope`: Node's module-syntax detection saw `import.meta` and loaded
  the file as ESM, but the rest of the file was CJS-shaped
  (`Object.defineProperty(exports, ...)`), so neither interpretation
  actually ran. Reproduced directly (`node -e
  "require('./dist/generated/prisma/client.js')"`) independent of any
  app logic.
- **RESOLVED and verified end-to-end.** All three entries above are one bug: Prisma's
  `prisma-client` generator defaults to **ESM** output and infers
  `moduleFormat` from `tsconfig.json` when it isn't set explicitly —
  that inference guessed wrong here (`"module": "nodenext"` with no
  `"type"` field in `apps/api/package.json` is genuinely ambiguous).
  Confirmed against Prisma's own changelog ("Prisma v7 ships as an ES
  module by default, which doesn't work with NestJS's CommonJS setup —
  setting `moduleFormat` to `cjs` forces Prisma to generate a CommonJS
  module instead") and a filed Prisma issue
  ([prisma/prisma#27556](https://github.com/prisma/prisma/issues/27556))
  with the identical `ReferenceError` symptom. Fix: added `moduleFormat
  = "cjs"` to the `generator client` block in
  `apps/api/prisma/schema.prisma`, matching how `apps/api` actually
  compiles (CommonJS-shaped, per `node-app.json`'s base config and the
  absent `"type"` field). Verified on a machine with normal network
  access: `pnpm --filter @ai-defense/api exec prisma generate`
  regenerated cleanly (`✓ Generated Prisma Client (7.8.0)`), and once
  the unrelated `dist/src/main.js` path bug below was also fixed, `node
  dist/src/main.js` booted clean — every controller's routes mapped and
  `[PrismaService] Connected to Postgres via @prisma/adapter-pg`, zero
  ESM/CJS errors anywhere in the boot path.
  **Confirmed impact:** retires the elevated-severity risk that
  `apps/api/Dockerfile`'s floating `FROM node:22-slim` tag exposed the
  production image to this same failure, and unblocks REQ-2.12's export
  script and REQ-2.14's integration tests (both were blocked by this
  same bug, not by anything specific to either REQ). **Both fully
  confirmed** (with a few more unrelated fixes layered on along the
  way — stale `event-schemas` build, an `AppModule` import-hoisting
  bug, `--experimental-vm-modules` for Prisma's WASM loader, a NodeNext
  `.js`-extension requirement — see the entries below and in
  [[Progress]]): `openapi:export` produced a real, verified
  `packages/contracts/openapi.json`, and `test:e2e` passes 3/3 against
  full Compose infra. **Update:** REQ-2.14's three integration tests are
  now written — `apps/api/test/mission-lifecycle.e2e-spec.ts` covers
  mission CRUD round-trip, signed URL generation (with object-key
  attach verified via a follow-up GET), and illegal-transition
  rejection (DRAFT→COMPLETED, asserts 409 + `MISSION_ILLEGAL_TRANSITION`).
  Driven over real HTTP via `supertest` against the full `AppModule`
  (register → JWT → authenticated requests) rather than the feature-
  module-only style REQ-3.15 used, since REQ-2.14 is explicitly about
  the HTTP-facing contract; confirmed `KafkaModule` doesn't need
  excluding since its consumer no-ops without `KAFKA_BROKERS` instead
  of failing boot. Lint and `tsc --noEmit` both clean. Not yet run — no
  docker daemon in this sandbox; needs `docker compose up -d postgres
  minio` + `DATABASE_URL`/`JWT_SECRET`/`MINIO_ROOT_USER`/
  `MINIO_ROOT_PASSWORD` on a normal dev machine, then `pnpm --filter
  @ai-defense/api run test:e2e`.
- **Found and fixed: `node dist/main.js` was never the right path,
  independent of the Prisma bug above.** Surfaced when actually running
  the verification steps above on a real machine for the first time —
  `Error: Cannot find module '.../apps/api/dist/main.js'`. Cause:
  `apps/api/tsconfig.json` sets `rootDir` to `"./"` (apps/api itself,
  not `"src"`) so one `tsc` invocation also compiles the sibling
  `prisma.config.ts` and `generated/prisma/` alongside `src/`; every
  `src/` file's output therefore nests one level deeper than the
  NestJS-CLI-default assumption — `dist/src/main.js`, not
  `dist/main.js`. Both `apps/api/package.json`'s `start:prod` script and
  `apps/api/Dockerfile`'s `CMD` had the wrong path, meaning `pnpm run
  start:prod` and the built Docker image's `api` container have never
  actually been runnable, in any session, until now. Fixed both this
  session (`start:prod` → `node dist/src/main`, Dockerfile `CMD` →
  `["node", "dist/src/main.js"]`). **Verified fixed**: `node
  dist/src/main.js` booted clean with the corrected path (same run that
  confirmed the Prisma fix above). Still worth a `docker compose up
  --build api` run to confirm the Dockerfile `CMD` specifically resolves
  the same way, not just the local `node` invocation.
- **`nest build` (and so `openapi:export`) briefly failed for a third,
  unrelated reason**: `src/` already has real Phase 3 REQ-3.14 code
  (`src/kafka/`, `src/processed-events/`) wired into `AppModule` —
  in-progress work from outside this session, not yet reflected in
  [[Progress]]'s Phase 3 checklist. `package.json` already correctly
  declared `@ai-defense/event-schemas`/`kafkajs` as dependencies, but
  `pnpm install` hadn't been re-run since they were added, so the
  `node_modules` links didn't exist. Also fixed a real
  `noImplicitAny` violation this build surfaced: typed
  `processing-events-consumer.service.ts`'s `eachMessage` callback
  against kafkajs's `EachMessagePayload`. Noted, not fixed: this
  code's `processed-events.repository.ts` references a
  `20260714120000_kafka_event_platform` migration that doesn't exist
  under `apps/api/prisma/migrations/` yet.

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
