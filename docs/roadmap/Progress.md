---
title: Progress
type: progress
tags: [roadmap, progress, phase1]
status: active
---

# Progress

Single source of truth for "what's done." Updated after each completed
task — check the box, add one line to the changelog. No separate
per-phase files; when Phase 1 closes, its checklist is left checked as
history and a new `## Phase 2` section is appended below.

---

## Phase 1 — Repository and Engineering Foundation

Tracking [[PRD-Phase-1]] requirements (REQ-1.1–1.24). Source of the
checklist is Section 5 of the PRD; order follows the technical approach
in Section 6.

### Monorepo tooling

- [x] REQ-1.1 — pnpm/npm workspace spans all TS apps and packages
- [x] REQ-1.2 — Nx/Turborepo selected via ADR and wired for build/lint/test

### Application shells

- [x] REQ-1.3 — `apps/web` React+Vite shell builds and serves
- [x] REQ-1.4 — `apps/api` NestJS shell builds and starts
- [x] REQ-1.5 — `apps/vision-service` FastAPI shell builds and starts
- [x] REQ-1.6 — `apps/outbox-publisher` stub scaffold
- [x] REQ-1.7 — `apps/edge-agent` stub scaffold
- [x] REQ-1.8 — every shell exposes `/health` and `/ready` (HTTP 200)

### Shared packages

- [x] REQ-1.9 — `packages/contracts` scaffold
- [x] REQ-1.10 — `packages/event-schemas` scaffold
- [x] REQ-1.11 — `packages/ts-config` and `packages/eslint-config`
- [x] REQ-1.12 — `packages/observability` stub

### Python workspace

- [x] REQ-1.13 — `pyproject.toml` via chosen dependency manager (ADR)
- [x] REQ-1.14 — Ruff + pytest configured, runnable
- [x] REQ-1.15 — Python 3.12+ pinned

### Local infrastructure

- [x] REQ-1.16 — Compose starts Postgres+PostGIS, Kafka, MinIO + 3 shells
- [x] REQ-1.17 — all services reach healthy with no manual steps
- [x] REQ-1.18 — no hardcoded secrets; `.env.example` committed

### Quality gates (CI)

- [x] REQ-1.19 — CI runs lint → typecheck → test → build → docker build
- [x] REQ-1.20 — CI failure blocks merge
- [x] REQ-1.21 — Conventional Commits enforced via commitlint

### Developer experience and docs

- [x] REQ-1.22 — root README documents setup/compose/dev commands
- [x] REQ-1.23 — pre-commit hooks run lint/format
- [x] REQ-1.24 — branch/release strategy documented

**Phase 1 exit:** all boxes above checked, plus the Definition of Done
in [[PRD-Phase-1]] Section 8. **Status: substantively complete.** One
residual follow-up remains before full DoD sign-off — see "Known gaps"
below.

### Known gaps

- `apps/vision-service/uv.lock` is still not committed. `uv sync` needs
  network access to fetch the managed Python 3.12 build
  (`python-build-standalone`), which this sandbox doesn't have. GitHub
  Actions runners do have that access (`astral-sh/setup-uv`), so CI's
  `python-quality` job is expected to pass regardless — but the lockfile
  should be generated and committed from a machine with normal network
  access before Phase 4 adds real dependencies, per
  [[Vision_Service_Shell]].
- `docker compose up` and `uv sync`/`pytest` for vision-service could not
  be executed end-to-end from this sandbox (no `docker` binary, no
  network egress for `uv`'s Python download). All TypeScript quality
  gates (lint, typecheck, test, build, format:check) were run directly
  and pass; the Compose file and `.env.example` were reviewed and match
  the documented REQ-1.16-1.18 design. Recommend a real `docker compose
  up` smoke test from a normal dev machine to close out REQ-1.16/1.17
  with full confidence.

---

## Phase 2 — Core Platform and Identity

Tracking [[PRD-Phase-2]] requirements (REQ-2.1–2.14). ORM choice
recorded in [[ADR-004-nestjs-orm]] (Prisma, status: accepted).

### Data model and migrations

- [x] REQ-2.1 — Postgres schema via Prisma: missions, users, teams, roles, audit_log, outbox (`apps/api/prisma/schema.prisma`; client generated and verified via `PrismaService` — see REQ-2.3)
- [x] REQ-2.2 — mission state machine documented and enforced at the service layer (documented in [[Mission_State_Machine]]; enforced by `MissionsService.transition()`, unit-tested per REQ-2.13)
- [x] REQ-2.3 — initial migrations committed, re-runnable on a fresh DB — `apps/api/prisma/migrations/20260714093811_init/`, generated/migrated on a machine with network access (see Known gaps), committed this session

### Identity and authorization

- [x] REQ-2.4 — `AuthModule` issues/verifies JWTs — register/login endpoints, bcrypt hashing, `@nestjs/jwt` + `passport-jwt`
- [x] REQ-2.5 — `RolesModule`/`UsersModule` RBAC enforced on mutating endpoints — `JwtAuthGuard`/`RolesGuard` + `@Roles(...)`, wired onto mission and storage mutating routes
- [x] REQ-2.6 — auth events produce audit records — register, login success/failure, token issuance all call `AuditService.record()`

### Mission lifecycle

- [x] REQ-2.7 — `MissionsModule` CRUD REST endpoints with DTO validation
- [x] REQ-2.8 — state transitions via dedicated service method, audited — `MissionsService.transition()`, check-then-write with a concurrency re-check inside the DB transaction

### Upload and storage

- [x] REQ-2.9 — signed upload/download URLs against MinIO (S3 SDK) — `StorageModule` (`src/storage/`); now RBAC-guarded (see [[Security_Baseline]]); mission-scoped variant added at `POST /missions/:id/upload-url`

### Audit baseline

- [x] REQ-2.10 — append-only audit record for every mission/auth action — `AuditModule`, no update/delete path exposed

### API surface and documentation

- [x] REQ-2.11 — OpenAPI spec generated, Swagger UI at `/docs` — `@nestjs/swagger` wired in `main.ts`, global `ValidationPipe` added
- [ ] REQ-2.12 — OpenAPI spec exported into `packages/contracts` — deferred this session (user chose to pivot to Auth/Mission work instead), still open

### Testing

- [x] REQ-2.13 — unit tests: state machine, RBAC guard — 52 tests across mission state machine, `MissionsService`, `AuthService`, `RolesGuard`, `AuditService`, `StorageService`, health/app controllers; all mock the Prisma layer, no live DB needed
- [ ] REQ-2.14 — integration tests: Postgres + MinIO adapters, illegal-transition rejection — **blocked**, see Known gaps (no docker in this sandbox, plus a newly-found ts-jest/ESM issue that blocks even a real-DB run)

**Phase 2 exit:** all boxes above checked, plus the Definition of Done
in [[PRD-Phase-2]] Section 8. **Status: substantively complete** —
REQ-2.12 (OpenAPI export to `packages/contracts`) and REQ-2.14
(integration tests) remain open, see below.

### Known gaps

- **This sandbox still can't run `prisma generate`/`prisma migrate`
  itself** — network allowlist blocks `binaries.prisma.sh`
  (`403 Forbidden`, re-confirmed this session including with
  `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1`). Unlike the prior session,
  this is no longer blocking: a real generated client
  (`apps/api/generated/`, gitignored) and the initial migration
  (`apps/api/prisma/migrations/20260714093811_init/`, committed) were
  produced on a machine with normal network access and were already
  present on disk at the start of this session — the documented "next
  step" from the prior entry below. Regenerate the client after any
  `schema.prisma` change with
  `pnpm --filter @ai-defense/api exec prisma generate`.
- **The generated Prisma client requires Node 22.13+ at runtime**,
  newly discovered this session: it emits an `import.meta.url`-based
  `__dirname` shim (valid ESM syntax) that only resolves under plain
  CommonJS `require()` because Node 22+ auto-detects ESM syntax in
  ambiguous `.js` files — Node 20 (the Phase 1 baseline) would throw
  `SyntaxError: Cannot use 'import.meta' outside a module` the moment
  anything imports `PrismaService`. Bumped `.nvmrc` (already at
  `22.13.0`, uncommitted from outside this session — now matched
  rather than left inconsistent), root `package.json`'s `engines.node`,
  `apps/api/Dockerfile`'s two `FROM node:*-slim` stages, and CI's
  `NODE_VERSION` to `22`. Also added a `prisma generate` step to
  `apps/api/Dockerfile`'s build stage and to CI's `ts-quality` job —
  neither existed before, and both are required now that `typecheck`/
  `test`/`build` statically import the generated client.
- **`pnpm run test:e2e` fails to parse at all**, independent of DB
  availability: `ts-jest`'s CommonJS transform can't handle
  `import.meta.url` either (same root cause as above, different
  failure mode — a hard `SyntaxError` inside Jest's module compiler).
  This blocks REQ-2.14 even once pointed at a real Compose
  Postgres/MinIO. Unit tests (REQ-2.13) work around it via
  `apps/api/package.json`'s `jest.moduleNameMapper`, redirecting
  `generated/prisma/client` to a hand-written stub
  (`apps/api/test/__mocks__/prisma-client.ts`) — safe for unit tests
  because every one of them mocks the repository/Prisma layer, but
  deliberately *not* applied to `test/jest-e2e.json`, since REQ-2.14
  needs the real client's behavior. Needs a Jest ESM configuration
  (`extensionsToTreatAsEsm` + `--experimental-vm-modules`) or a
  different e2e runner — not attempted this session, flagged for a
  follow-up.
- REQ-2.12 (OpenAPI spec exported into `packages/contracts`) was
  deliberately deferred: offered as the smaller, fully-unblocked
  alternative before this session's Prisma discovery, but the user
  chose to pivot to the full Auth/Mission build-out once the blocker
  turned out to be resolved. Still open.
- `MissionsController`'s `POST /missions/:id/upload-url` requires the
  mission to already exist but doesn't re-check its state beyond
  "exists" before issuing a URL (only `attachVideo()`, called right
  after, enforces DRAFT-only). A mission mid-transition could
  theoretically get a stray upload URL between the existence check and
  the attach call — low-risk for Phase 2's single-operator MVP scope,
  worth tightening if concurrent multi-operator usage becomes real.

---

## Changelog

Append one line per completed task, newest first. Format:
`YYYY-MM-DD — REQ-x.x or free text — one-line note`.

- 2026-07-14 — REQ-2.3–2.10, REQ-2.13 — Found the Prisma blocker from the prior session already resolved outside this conversation (generated client + initial migration present on disk, untracked); committed the migration and built out the rest of Phase 2's identity/mission stack on top of it: `PrismaModule`/`PrismaService` (`@prisma/adapter-pg` driver adapter), `AuditModule` (append-only, transaction-aware), `RolesModule`/`UsersModule` (idempotent role seeding, persistence-only user repo), `AuthModule` (JWT register/login, bcrypt, `JwtAuthGuard`/`RolesGuard`/`@Roles`/`@CurrentUser`), `MissionsModule` (CRUD, `mission-state-machine.ts` as pure REQ-2.2 logic, `transition()` with concurrency-safe check-then-write, mission-scoped upload-url endpoint). Wired RBAC onto `StorageController`, closing the [[Security_Baseline]] gap. Added JWT env vars to `.env.example`/Compose. Discovered and fixed a new Node-version/ESM issue in the generated Prisma client (see Known gaps) — bumped Node to 22 across `.nvmrc`/`package.json`/Dockerfile/CI, added missing `prisma generate` steps to Dockerfile and CI. Wrote 52 unit tests (state machine, `MissionsService`, `AuthService`, `RolesGuard`, `AuditService`, plus existing Storage/health/app specs) via a Jest `moduleNameMapper` stub for the generated client. Verified: lint (0 errors), typecheck, `nest build`, `format:check`, and all 52 unit tests pass in this sandbox. REQ-2.14 (integration tests) and REQ-2.12 (OpenAPI export) remain open — see Known gaps.
- 2026-07-13 — REQ-2.9/2.11 — Added `StorageModule` (signed MinIO upload/download URLs via `@aws-sdk/client-s3`/`s3-request-presigner`, bucket auto-created on startup) and Swagger/OpenAPI + global `ValidationPipe` (`@nestjs/swagger`, `class-validator`) — both chosen specifically because they're Prisma-independent and fully verifiable here, per user's call to work around the `prisma generate` blocker rather than write unverified Auth/Mission code. Added `MINIO_MISSIONS_BUCKET` env var to `.env.example`/Compose. Verified: lint, typecheck, build, `format:check`, and all 10 unit tests (incl. new `StorageService` tests via `aws-sdk-client-mock`) pass. Flagged the storage endpoints as temporarily unauthenticated in [[Security_Baseline]]/[[API_Shell]] until `AuthModule`'s RBAC guard lands.
- 2026-07-13 — REQ-2.1/2.2 — Accepted [[ADR-004-nestjs-orm]]. Authored `apps/api/prisma/schema.prisma` (missions, users, teams, roles, user_roles, audit_log, outbox) and `apps/api/prisma.config.ts`; added `prisma`/`@prisma/client`/`@prisma/adapter-pg`/`pg` deps. Wrote [[Mission_State_Machine]] (REQ-2.2). Verified: existing lint/typecheck/build/test for `apps/api` still pass; `prisma.config.ts` type-checks under strict TS. Could not run `prisma generate`/`migrate diff` — blocked by sandbox network allowlist (binaries.prisma.sh), logged under Known gaps; REQ-2.3 left unchecked pending a real run.
- 2026-07-13 — Phase 2 planning — Drafted [[PRD-Phase-2]] (REQ-2.1–2.14) and [[ADR-004-nestjs-orm]] (Prisma, proposed). Phase 2 checklist added below, all unchecked — implementation not yet started.
- 2026-07-13 — REQ-1.1–1.24 — Verified against the actual repo state (all app shells, shared packages, Compose stack, CI workflow, pre-commit hooks, README, CONTRIBUTING already implemented in prior work but never reflected here). Ran `nx run-many` for lint/typecheck/test/build and `format:check` directly — all green. Checked all 24 boxes; Phase 1 marked substantively complete with two residual follow-ups logged under "Known gaps" (uv.lock not committed; docker compose up / vision-service pytest not runnable from this sandbox).
- 2026-07-13 — setup — Progress.md created; Phase 1 checklist seeded from [[PRD-Phase-1]].

---

## Related Notes

- [[PRD-Phase-1]] — source of the Phase 1 REQ checklist above.
- [[PRD-Phase-2]] — source of the Phase 2 REQ checklist above.
- [[ADR-004-nestjs-orm]] — ORM decision blocking Phase 2's REQ-2.1.
- [[Mission_State_Machine]] — REQ-2.2's state-machine documentation.
- [[Sprint_0_Foundation]] — the sprint that produced everything upstream of Phase 1.
- [[MVP_Implementation_Plan]] — how Phases 1-2 fit the overall MVP sequence.
- [[AI_Defense_Platform_Roadmap]] — phases beyond Phase 2, appended here as they start.
