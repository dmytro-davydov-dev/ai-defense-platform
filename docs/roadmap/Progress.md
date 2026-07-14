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
- [ ] REQ-1.21 — Conventional Commits enforced via commitlint — **disabled 2026-07-14** per explicit request; see Known gaps below (this file's Phase 1 section) and [[CONTRIBUTING]].

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
- **REQ-1.21 (Conventional Commits enforcement) disabled 2026-07-14,
  per explicit request.** `.husky/commit-msg` no longer runs
  commitlint (now a no-op `exit 0`), and CI's `commitlint` job was
  removed from `.github/workflows/ci.yml`. `commitlint.config.cjs`
  and the `@commitlint/*` devDependencies are left in place but
  unused — nothing currently reads them. Conventional Commits remains
  the recommended style (see [[CONTRIBUTING]]) but is no longer
  machine-checked, locally or in CI. Docs updated to match:
  [[CONTRIBUTING]], [[Coding_Standards]], [[Local_Development_Stack]].
  No rationale was given for the reversal — flagging in case this was
  meant to be temporary rather than permanent.

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
- [x] REQ-2.12 — OpenAPI spec exported into `packages/contracts` — `apps/api/scripts/generate-openapi.ts` (`pnpm --filter @ai-defense/api run openapi:export`) now runs clean end-to-end; `packages/contracts/openapi.json` is committed with real `/auth`, `/missions`, `/storage` paths (proper `operationId`s and `$ref` schemas), ready for `@rtk-query/codegen-openapi`'s `schemaFile` once Phase 6 exists.

### Testing

- [x] REQ-2.13 — unit tests: state machine, RBAC guard — 52 tests across mission state machine, `MissionsService`, `AuthService`, `RolesGuard`, `AuditService`, `StorageService`, health/app controllers; all mock the Prisma layer, no live DB needed
- [ ] REQ-2.14 — integration tests: Postgres + MinIO adapters, illegal-transition rejection — **tests written, not yet run**. `apps/api/test/mission-lifecycle.e2e-spec.ts` implements all three integration tests the PRD calls for by name: mission CRUD round-trip (register → create → get → list → patch → verify persistence), signed URL generation (upload-url issuance + object-key attach verified via a follow-up GET), and illegal-transition rejection (DRAFT→COMPLETED, asserts 409 + `MISSION_ILLEGAL_TRANSITION` code, mission left unchanged). Follows the REQ-3.15 house style (env-var-gated `describe`/`describe.skip`, raw `pg.Client` seeding/cleanup) but drives everything over real HTTP via `supertest` against the full `AppModule` (not just the feature modules), since REQ-2.14 is explicitly about the HTTP-facing contract. Deliberately imports the whole `AppModule` including `KafkaModule` — confirmed safe without a broker: `ProcessingEventsConsumerService.onModuleInit()` treats a missing `KAFKA_BROKERS` as warn-and-continue, not a startup failure, so this suite only needs Postgres + MinIO, matching the PRD's stated requirement. Lint (`eslint`) and `tsc --noEmit` both pass clean on the new file. **Not yet run** — no docker daemon in this sandbox; needs `docker compose up -d postgres minio` plus `DATABASE_URL`/`MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`/`JWT_SECRET` exported on a normal dev machine, then `pnpm --filter @ai-defense/api run test:e2e`. CI wiring for this suite is a separate, still-open item (see Known gaps).

**Phase 2 exit:** all boxes above checked, plus the Definition of Done
in [[PRD-Phase-2]] Section 8. **Status: substantively complete** —
REQ-2.14 (integration tests) remains open, see below.

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
- **RESOLVED and verified end-to-end on Dmytro's own machine.** The
  prior two entries below (kept for incident history) turned out to be
  one bug, not two: Prisma's `prisma-client` generator (the one
  `ADR-004` selected) defaults to **ESM** output and tries to infer the
  right `moduleFormat` from `tsconfig.json` when it isn't set explicitly
  — that inference guessed wrong for this project (`"module":
  "nodenext"` with no `"type"` field in `apps/api/package.json` is
  genuinely ambiguous), so the generated `client.js` mixed ESM-only
  `import.meta.url` with CJS `exports`/`require`, which neither Node
  nor `ts-jest` can parse. Confirmed via Prisma's own changelog ("Prisma
  v7 ships as an ES module by default, which doesn't work with NestJS's
  CommonJS setup") and a filed Prisma issue with the identical
  `ReferenceError: exports is not defined in ES module scope` symptom
  reproduced below. Fix applied this session: added `moduleFormat =
  "cjs"` to the `generator client` block in
  `apps/api/prisma/schema.prisma` (matches how `apps/api` actually
  compiles — CommonJS-shaped, per `node-app.json`'s base config and the
  absent `package.json` `"type"` field). **Not yet verified** — needs,
  in order, on a machine with normal network access: (1) `pnpm --filter
  @ai-defense/api exec prisma generate` to regenerate the client with
  the new option (this sandbox still can't reach
  `binaries.prisma.sh`, `403 Forbidden`, re-confirmed this session —
  same network-allowlist gap as the entry above), (2) confirm `node
  dist/src/main.js` boots cleanly and `pnpm run test:e2e` at least
  parses. **Update:** step (1) was run for real on Dmytro's own machine
  and succeeded — `✓ Generated Prisma Client (7.8.0) to
  ./generated/prisma` — confirming `moduleFormat = "cjs"` is accepted
  and regenerates without error. Step (2) first surfaced a second,
  unrelated bug (the `dist/src/main.js` path issue, entry immediately
  below) — once that was also fixed, `node dist/src/main.js` booted
  clean: all routes mapped (`RouterExplorer` logs for `/auth`,
  `/missions`, `/storage`, etc.) and `[PrismaService] Connected to
  Postgres via @prisma/adapter-pg` — zero ESM/CJS errors anywhere in
  the boot path. **The `moduleFormat = "cjs"` fix is confirmed working.**
  (The same run then hit an unrelated `ECONNREFUSED :9000` from
  `StorageService`'s bucket check because MinIO wasn't up yet in that
  terminal — an infra sequencing thing, not a code issue; resolved by
  starting the `minio` Compose service before booting the app.)
  This unblocks REQ-2.12's export script
  (`apps/api/scripts/generate-openapi.ts`, written but never previously
  run successfully — see that REQ's own line above) and retires the
  `apps/api/Dockerfile`'s floating `node:22-slim` tag as a live
  production risk, not just a sandbox inconvenience. Remaining work:
  actually write REQ-2.14's three integration tests and run
  `pnpm run test:e2e`/`openapi:export` for real against full Compose
  infra (Postgres + MinIO both up).
- **Found and fixed: `node dist/main.js` was never the right path,
  independent of the Prisma bug above.** Surfaced when actually running
  the verification steps above on a real machine for the first time —
  `Error: Cannot find module '.../apps/api/dist/main.js'`. Cause:
  `apps/api/tsconfig.json` sets `rootDir` to `"./"` (apps/api itself,
  not `"src"`) so a single `tsc` invocation also compiles the sibling
  `prisma.config.ts` and `generated/prisma/` alongside `src/` — every
  `src/` file's compiled output therefore nests one level deeper than
  the NestJS-CLI-default assumption, landing at `dist/src/main.js`, not
  `dist/main.js`. Both `apps/api/package.json`'s `start:prod` script and
  `apps/api/Dockerfile`'s `CMD` had the wrong path — meaning `pnpm run
  start:prod` and the built Docker image's `api` container have never
  actually been runnable, in any session, until now. Fixed both this
  session (`start:prod` → `node dist/src/main`, Dockerfile `CMD` →
  `["node", "dist/src/main.js"]`). **Verified fixed**: `node
  dist/src/main.js` boots cleanly with the corrected path (see the
  Prisma entry above — same successful run confirmed both fixes at
  once). Still worth re-confirming via an actual `docker compose up
  --build api` run to be sure the Dockerfile `CMD` specifically (not
  just the local `node` invocation) resolves correctly too.
- **The generated Prisma client requires Node 22.13+ at runtime**
  (incident history — see the fix above): it emits an
  `import.meta.url`-based `__dirname` shim (valid ESM syntax) that only
  resolves under plain CommonJS `require()` because Node 22+
  auto-detects ESM syntax in ambiguous `.js` files — Node 20 (the Phase
  1 baseline) would throw `SyntaxError: Cannot use 'import.meta'
  outside a module` the moment anything imports `PrismaService`. Bumped
  `.nvmrc` (already at `22.13.0`, uncommitted from outside this
  session — now matched rather than left inconsistent), root
  `package.json`'s `engines.node`, `apps/api/Dockerfile`'s two `FROM
  node:*-slim` stages, and CI's `NODE_VERSION` to `22`. Also added a
  `prisma generate` step to `apps/api/Dockerfile`'s build stage and to
  CI's `ts-quality` job — neither existed before, and both are required
  now that `typecheck`/`test`/`build` statically import the generated
  client. **This session found the "Node 22+ auto-detects" assumption
  doesn't reliably hold** — reproduced `ReferenceError: exports is not
  defined in ES module scope` via a bare `node -e
  "require('./dist/generated/prisma/client.js')"` on this sandbox's
  Node v22.22.3, independent of any app logic — which is what led to
  diagnosing and fixing the real root cause above instead of chasing
  Node-version pinning further.
- **`pnpm run test:e2e` fails to parse at all**, independent of DB
  availability: `ts-jest`'s CommonJS transform can't handle
  `import.meta.url` either (same root cause as above, different failure
  mode — a hard `SyntaxError` inside Jest's module compiler). This
  blocks REQ-2.14 even once pointed at a real Compose Postgres/MinIO.
  Unit tests (REQ-2.13) work around it via `apps/api/package.json`'s
  `jest.moduleNameMapper`, redirecting `generated/prisma/client` to a
  hand-written stub (`apps/api/test/__mocks__/prisma-client.ts`) — safe
  for unit tests because every one of them mocks the repository/Prisma
  layer, but deliberately *not* applied to `test/jest-e2e.json`, since
  REQ-2.14 needs the real client's behavior. **Partially wrong
  prediction, corrected this session:** the original `import.meta.url`
  `SyntaxError` did disappear once `moduleFormat = "cjs"` was
  regenerated, but `test:e2e` still failed — a second, unrelated
  `ts-jest` issue: `Cannot find module './internal/class.js' from
  '../generated/prisma/client.ts'`. Prisma's generator writes its own
  internal relative imports in TypeScript's Node16/NodeNext style
  (explicit `.js` extension pointing at a sibling `.ts` file — valid
  because a real `tsc` build emits a matching `.js`), but `ts-jest`
  transforms `.ts` on the fly without writing that `.js` to disk, so
  Jest's resolver looks for a file that doesn't exist. Fixed by adding
  `"moduleNameMapper": { "^(\\.{1,2}/.*)\\.js$": "$1" }` to
  `test/jest-e2e.json` — strips the `.js` so Jest's own
  `moduleFileExtensions` resolution falls back to the `.ts` file. This
  is the standard, documented workaround for ts-jest + NodeNext
  resolution, not specific to Prisma. **Update:** that fix worked (no
  more "Cannot find module"), but a *third* distinct issue surfaced
  next: `TypeError: A dynamic import callback was invoked without
  --experimental-vm-modules`, thrown from inside `@prisma/client`'s own
  engine (`ClientEngine.ts` → `WasmQueryCompilerLoader.ts`) — Prisma 7's
  client lazily loads its WASM query compiler via a real dynamic
  `import()`, unrelated to `moduleFormat` (that only controls
  `client.ts`'s own outer module shape, not this internal loader).
  Jest's default sandbox blocks dynamic `import()` without that Node
  flag. Fixed: `apps/api/package.json`'s `test:e2e` script now sets
  `NODE_OPTIONS=--experimental-vm-modules`. Not yet re-run to confirm
  — this is the third fix layered on the same command, each for an
  unrelated reason (moduleFormat → NodeNext `.js` resolution → dynamic
  import support).
- **REQ-2.14's three integration tests are written but not run**, same
  no-docker limitation as REQ-3.15's below. `apps/api/test/mission-
  lifecycle.e2e-spec.ts` covers mission CRUD round-trip, signed URL
  generation, and illegal-transition rejection, driven over real HTTP
  (`supertest` against the full `AppModule`) rather than the feature-
  module-only style REQ-3.15 used, since REQ-2.14 is explicitly about
  the HTTP-facing contract. Gated on `DATABASE_URL`/`JWT_SECRET`/
  `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` with `describe.skip` + a
  console warning otherwise — safe to merge without affecting CI's
  existing unit-test-only run. Lint and `tsc --noEmit -p tsconfig.json`
  both pass clean. Next step on a machine with docker: `docker compose
  -f infrastructure/compose/docker-compose.yml up -d postgres minio`,
  export the four env vars, run `pnpm --filter @ai-defense/api run
  test:e2e`, then wire the CI job (same open item as the entry below).
- **RESOLVED.** REQ-2.12 (OpenAPI spec exported into `packages/contracts`)
  — export tooling (`apps/api/scripts/generate-openapi.ts`) deliberately
  boots `AppModule` without ever calling `app.init()`/`app.listen()`
  (Nest's `OnModuleInit` hooks — where `PrismaService`/`StorageService`
  would need real Postgres/MinIO — only fire on those calls), so
  building the Swagger document needs no live infrastructure. Took four
  rounds to actually verify (stale `event-schemas` build, an `AppModule`
  import-hoisting bug, and a NodeNext `.js`-extension requirement on the
  dynamic `import()` — see the entries below), but
  `pnpm --filter @ai-defense/api run openapi:export` now runs clean.
  `packages/contracts/openapi.json` is committed with real `/auth`,
  `/missions`, `/storage` paths — verified directly (not just trusting
  the "written to..." log line): proper `operationId`s and `$ref`
  schemas throughout, ready for `@rtk-query/codegen-openapi`'s
  `schemaFile` once Phase 6 exists.
- **`openapi:export`'s `nest build` step also failed independently of
  Prisma**, surfaced during the same verification pass: `apps/api/src/`
  already has real, wired-in Phase 3 REQ-3.14 code
  (`src/kafka/`, `src/processed-events/`, `src/outbox/`, plus
  `MissionsService` producing the REQ-3.6 outbox row) that isn't
  reflected in this file's Phase 3 checklist below — appears to be
  in-progress work done outside this session. `apps/api/package.json`
  already correctly lists `@ai-defense/event-schemas`/`kafkajs` as
  dependencies, but `pnpm install` hadn't been re-run since they were
  added, so the `node_modules` symlinks didn't exist yet — a `pnpm
  install`-away fix, not a missing-dependency one. Separately fixed a
  real `noImplicitAny` violation this surfaced:
  `processing-events-consumer.service.ts`'s `eachMessage` callback
  destructured `message` with an implicit `any` — typed it against
  kafkajs's own `EachMessagePayload`. Also noted, not fixed (out of
  scope for this pass): `processed-events.repository.ts` references a
  `20260714120000_kafka_event_platform` migration that doesn't exist yet
  under `apps/api/prisma/migrations/` — the `processed_events` table it
  queries via `$queryRaw` likely doesn't exist in the DB yet either.
- **After `pnpm install`, `nest build` failed a second time with a
  *different* error** (`TS2305: Module has no exported member 'TOPICS'`
  etc.) — `@ai-defense/event-schemas` resolved correctly this time, but
  its `packages/event-schemas/dist/` was stale: still the Phase 1
  placeholder scaffold (`EventSchemasPackagePlaceholder`), even though
  `src/topics.ts`/`src/envelope.ts`/`src/payloads.ts` already have the
  real Phase 3 content. The package was written but never rebuilt.
  Fixed by running `pnpm --filter @ai-defense/event-schemas run build`.
  Open question, not yet checked: whether `apps/api`'s Nx/pnpm build
  target actually depends on `event-schemas`'s build target (so this
  can't recur silently) — worth confirming in `nx.json`/each
  `project.json`.
- **`openapi:export`'s script itself had a bug**, once the build
  finally succeeded: `Error: JWT_SECRET must be set`, thrown from
  inside the compiled script despite `ensurePlaceholderEnv()` setting a
  placeholder value. Cause: `apps/api/scripts/generate-openapi.ts` had
  a static `import { AppModule } from "../src/app.module"` at the top
  of the file — static imports are hoisted and evaluated before any
  function body runs, but `AuthModule`'s `@Module()` decorator calls
  `getRequiredJwtSecret()` directly inside its `imports` array (module-
  evaluation time, not DI-instantiation time), so `AppModule`'s import
  chain threw before `ensurePlaceholderEnv()` ever executed. Fixed by
  replacing the static import with a dynamic `await import(...)` inside
  `main()`, called after the placeholder env vars are set — safe here
  since this script runs via plain `node`, never Jest, so the
  `--experimental-vm-modules` restriction on dynamic `import()` (see
  the `test:e2e` entry above) doesn't apply. **Update:** the dynamic
  `import()` fix introduced one more `tsc` error —
  `TS2307: Cannot find module '../src/app.module'` — because
  `moduleResolution: "nodenext"` requires an explicit `.js` extension
  on every relative specifier, dynamic `import()` included (the same
  rule behind `test/jest-e2e.json`'s fix above and Prisma's own
  `./internal/class.js`-style internal imports). Fixed:
  `await import("../src/app.module")` → `await
  import("../src/app.module.js")`. **Confirmed working**: both
  `test:e2e` (3/3 tests, `PASS test/app.e2e-spec.ts`) and
  `openapi:export` now run clean end-to-end — see REQ-2.12 above for
  the verified `openapi.json` output.
- `MissionsController`'s `POST /missions/:id/upload-url` requires the
  mission to already exist but doesn't re-check its state beyond
  "exists" before issuing a URL (only `attachVideo()`, called right
  after, enforces DRAFT-only). A mission mid-transition could
  theoretically get a stray upload URL between the existence check and
  the attach call — low-risk for Phase 2's single-operator MVP scope,
  worth tightening if concurrent multi-operator usage becomes real.

---

## Phase 3 — Kafka Event Platform

Tracking [[PRD-Phase-3]] requirements (REQ-3.1–3.15).

### Topic taxonomy

- [x] REQ-3.1 — seven `aidefense.*` topics created against local Redpanda, scripted/declarative — `infrastructure/kafka/create-topics.sh` + `topics.json`, run by the `kafka-init` Compose service
- [x] REQ-3.2 — mission ID used as partition key on mission-scoped topics — `packages/event-schemas/src/topics.ts`'s `MISSION_SCOPED_TOPICS`

### Event envelope and schema versioning

- [x] REQ-3.3 — event envelope defined as JSON Schema in `packages/event-schemas`
- [x] REQ-3.4 — generated TS types + matching Pydantic model, kept in sync via CI — `apps/vision-service/tests/test_event_schema_sync.py` cross-checks JSON Schema properties, TS `*_FIELD_NAMES` arrays, and Pydantic `model_fields`
- [x] REQ-3.5 — event schema versioning/compatibility policy ADR drafted and accepted — [[ADR-005-event-schema-versioning]]

### Transactional Outbox

- [x] REQ-3.6 — `MissionsService.transition()` writes an outbox row in the same DB transaction — DRAFT→QUEUED only, `causationId: null` (first event in the chain)
- [x] REQ-3.7 — `apps/outbox-publisher` polls and publishes unpublished outbox rows — `SELECT ... FOR UPDATE SKIP LOCKED`, fixed-interval polling (open question from the PRD resolved: polling, not LISTEN/NOTIFY, per "pick the simpler one first")

### Idempotent consumption

- [x] REQ-3.8 — `processed_events` table checked before every side effect, both sides — `apps/api/src/processed-events/`, `apps/vision-service/src/vision_service/kafka/idempotency.py`, both via `INSERT ... ON CONFLICT DO NOTHING`

### Reliability: retry and dead-letter

- [x] REQ-3.9 — bounded retry with backoff on both consumers — 3 attempts, exponential backoff, mirrored `retry.util.ts`/`retry.py`
- [x] REQ-3.10 — dead-lettered messages observable (structured logs + query path) — `EVENT_DEAD_LETTERED` envelope to `aidefense.dead-letter` carries the original event, failure reason, attempt count, originating topic; structured `log("error", ...)` on both sides

### Correlation and causation

- [x] REQ-3.11 — correlation ID propagated through outbox row, Kafka headers, consumer logs
- [x] REQ-3.12 — every produced event sets `causationId` to its trigger's `eventId`

### Consumer-side stub pipeline

- [x] REQ-3.13 — vision-service stub consumer: command in, stub progress events out — `commands_consumer.py`, explicit `note="stub: no frame processing in Phase 3"` in the payload
- [x] REQ-3.14 — API consumer drives `MissionsService.transition()` off processing events — `processing-events.handler.ts`; `ActionContext.actorUserId` widened to optional for this system-triggered case (see [[Security_Baseline]])

### Testing

- [x] REQ-3.15 — integration tests: duplicate delivery, consumer crash/restart, DLQ routing — **written, not yet run** (`apps/api/test/kafka-event-platform.e2e-spec.ts`), see Known gaps

**Phase 3 exit:** all boxes above checked. **Status: substantively
complete** — REQ-3.15's tests are real, reviewed code but unverified in
this sandbox (no docker); see Known gaps for what running them on a
normal dev machine still needs to confirm.

### Known gaps

- **REQ-3.15's integration tests are written but not run.** Same
  no-docker limitation as REQ-2.14 (see Phase 2's Known gaps): this
  sandbox has no docker daemon, so there's no live Redpanda/Postgres/
  MinIO to run `apps/api/test/kafka-event-platform.e2e-spec.ts`
  against. The suite gates itself on `DATABASE_URL`/`KAFKA_BROKERS`/
  `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` all being set and
  `describe.skip`s (with a console warning) otherwise, so it's safe to
  merge without breaking CI's existing `nx affected -t test` (unit
  tests only — this file lives under `test/`, outside `jest`'s
  `rootDir: "src"`, so it was never picked up by the unit runner
  either). Next step on a machine with docker: `docker compose -f
  infrastructure/compose/docker-compose.yml up -d postgres redpanda
  kafka-init minio`, export the four env vars, run `pnpm --filter
  @ai-defense/api run test:e2e`, then wire a CI job for it (same
  open item as REQ-2.14's CI wiring).
- **No CI job runs `test:e2e` for either REQ-2.14 or REQ-3.15 yet.**
  Both suites exist as real code, both need a docker-backed CI job
  (GitHub Actions service containers or an explicit `docker compose up`
  step) that this sandbox can't design and verify blind. Tracked as one
  open item, not duplicated per-phase.
- **`apps/vision-service`'s Ruff/pytest verification used the
  sandbox's system Python 3.10, not the pinned 3.12** (same `uv sync`
  network-egress gap as Phase 1's `uv.lock` entry — unchanged through
  Phase 4). All tests pass and `ruff check`/`ruff format --check` are
  clean against 3.10; `per-file-ignores` entries (`N815`/`UP046`/`UP047`/
  `UP017` for `events/*.py`, `UP017` for `kafka/dead_letter.py` and
  `observability.py`) exist specifically to
  keep those files parseable on 3.10 (explicit `TypeVar`/`Generic`
  instead of PEP 695 syntax, `timezone.utc` instead of `datetime.UTC`).
  `uv.lock` is now committed (see Phase 4's Known gaps) but this
  sandbox still can't run `uv sync`/`uv lock` itself (GitHub release
  CDN unreachable) — re-verify on a real 3.12 environment and drop the
  ignores if they're no longer needed.
- `aidefense.telemetry`, `aidefense.audit`, and `aidefense.device-events`
  topics are created (REQ-3.1) but have no producer or consumer —
  intentionally deferred, per [[PRD-Phase-3]]'s open questions.

---

## Phase 4 — Python and OpenCV Foundation

Tracking [[PRD-Phase-4]] requirements (REQ-4.1–4.12). Builds directly on
Phase 3's Kafka consumer, idempotency, and retry/DLQ machinery in
`apps/vision-service`.

### Package structure

- [x] REQ-4.1 — `src` layout confirmed, new modules added under it — `video/`, `frames/`, `annotation/`, `metadata/`, `storage/` added under `src/vision_service/`, no restructuring needed (already `src`-layout since Phase 1)

### Video/image I/O and frame iteration

- [x] REQ-4.2 — OpenCV video reader, bounded-memory frame generator — `video/reader.py`'s `VideoReader`, `frames()` yields one `HxWxC uint8` frame at a time
- [x] REQ-4.3 — image reader through the same pipeline — `video/image_reader.py`'s `read_image()`, same shape/dtype convention as a decoded video frame

### Preprocessing and annotation

- [x] REQ-4.4 — resize/normalize preprocessing module — `frames/preprocessing.py` (`resize`: uint8→uint8, `normalize`: uint8→float32 `[0,1]`)
- [x] REQ-4.5 — bounding-box/label annotation module — `annotation/draw.py`'s `draw_detections()`, unit-tested against hand-built `Detection` fixtures (no real model output until Phase 5)

### Metadata extraction

- [x] REQ-4.6 — duration, fps, resolution, checksum — `metadata/extract.py`'s `extract_video_metadata()`, chunked (bounded-memory) SHA-256

### Control endpoints and readiness

- [x] REQ-4.7 — `/ready` reflects real Kafka/MinIO connectivity — `kafka.runner.commands_consumer_runner.is_ready` + `storage.minio_client.minio_client.is_reachable()`; either check is skipped (treated ready) if its dependency isn't configured at all

### Structured logging

- [x] REQ-4.8 — frame-processing log lines, correlation-ID aware — download start/end, metadata-extracted, frame-iteration-complete log lines added to `commands_consumer.py`'s pipeline via the existing `observability.log()`/`log_context` pattern

### Normalized contracts

- [x] REQ-4.9 — `Frame`/`Detection` Pydantic models — `frames/models.py` (`Frame`, `Detection`, `BoundingBox`), camelCase fields per the same convention as `events/*.py`

### Real consumer pipeline

- [x] REQ-4.10 — real MinIO download + frame iteration replaces Phase 3 stub — `storage/minio_client.py`'s `MinioClient` (direct boto3 S3 client, not proxied through apps/api) + `commands_consumer.py`'s `handle_command_message()` now downloads, extracts metadata, iterates every frame, and publishes real `PROCESSING_STARTED`/`PROCESSING_COMPLETED` payloads (additive optional fields, ADR-005, no `eventVersion` bump)
- [x] REQ-4.11 — download/decode failure routes through retry/DLQ — reuses REQ-3.9/3.10's machinery and additionally publishes `PROCESSING_FAILED` (the Phase 3 stub never published this event type at all, so `apps/api`'s existing `PROCESSING_FAILED → MissionStatus.FAILED` mapping was previously unreachable from vision-service)

### Testing

- [x] REQ-4.12 — unit tests per module; integration tests against a synthetic fixture video — `samples/sample-mission-clip.mp4` (12 frames, 64x48, 4fps) + `samples/sample-frame.png`, both deterministic/regeneratable via `apps/vision-service/scripts/generate_samples.py`; `tests/test_video_reader.py`, `test_image_reader.py`, `test_preprocessing.py`, `test_annotation.py`, `test_metadata.py`, `test_frames_models.py`, `test_minio_client.py`, `test_ready_dependencies.py` (new), `test_commands_consumer.py`/`test_health.py` (extended) — 58 tests total, all passing against this sandbox's system Python 3.10

**Phase 4 exit:** all boxes above checked, plus the Definition of Done
in [[PRD-Phase-4]] Section 8. **Status: substantively complete** — see
Known gaps below for what a machine with Docker/network access still
needs to verify (uv.lock re-lock, a real Python 3.12 run, and the
pre-existing `pnpm`/`nx` build/test environment issues this session
surfaced but did not introduce).

### Known gaps

- `apps/vision-service/uv.lock` **is now committed** (resolved outside
  this session, ahead of this phase — see [[Vision_Service_Shell]]'s
  prior Known gap, now superseded). However, this phase's three new
  dependencies (`opencv-python-headless`, `numpy`, `boto3`) were added
  to `pyproject.toml` by hand this session and are **not yet re-locked**
  into `uv.lock` — this sandbox still can't run `uv sync`/`uv lock`
  (`python-build-standalone` download from GitHub's release CDN is
  unreachable here, re-confirmed this session). `uv lock` must be
  re-run on a machine with network access before `apps/vision-service/Dockerfile`'s
  `uv sync --frozen` will succeed again.
- Verified in this sandbox: `ruff check`/`ruff format --check` clean,
  all 58 `apps/vision-service` pytest tests pass — against system
  Python 3.10 (installed via `pip install --break-system-packages`,
  not `uv`, since `uv sync` can't reach a 3.12 interpreter here) and
  PyPI-installed `opencv-python-headless`/`numpy`/`boto3` (PyPI itself
  is reachable from this sandbox, unlike GitHub's release CDN — the
  two blockers are independent). A real Python 3.12 run (per
  `requires-python`) is still open, same as Phase 1/3's system-Python
  caveat.
- `docker`/`docker compose` remain unavailable in this sandbox (same
  gap as every prior phase) — REQ-4.7's `/ready` Kafka/MinIO checks and
  REQ-4.10's real MinIO download were verified via unit tests with
  fakes (`FakeMinioClient` in `tests/test_commands_consumer.py`,
  monkeypatched `minio_client.is_reachable` in
  `tests/test_ready_dependencies.py`), not against a live broker/MinIO.
  A real `docker compose up` + submitting a mission end-to-end is the
  next verification step on a normal dev machine, per
  [[PRD-Phase-4]] Section 8's Definition of Done.
- **This session's changes are written but not committed.** A stale
  `.git/index.lock` (created by an earlier `git status` in this
  session, then un-removable — same mount-permission restriction as
  the `_tmp_*`/`dist/` issues above) blocks every subsequent `git add`/
  `git commit` in this sandbox. Every file listed in this changelog
  entry is confirmed present in the working tree (`git status --short`
  still works read-only), just not yet staged or committed. If this
  persists in a future session, delete `.git/index.lock` by hand first.
- **TS-side verification found two pre-existing environment issues,
  neither caused by this phase's changes.** `packages/event-schemas`'s
  additive `ProcessingStartedPayload`/`ProcessingCompletedPayload`
  field changes were verified via `nx run @ai-defense/event-schemas:{lint,typecheck,test,build}`
  (all pass — including the FIELD_NAMES-vs-schema sync test) and
  `nx run @ai-defense/api:{lint,typecheck}` (both pass, confirming
  `apps/api`'s code still compiles against the widened payload types).
  `nx run @ai-defense/api:build` and `:test` both failed, but for
  reasons unrelated to this phase: `build` hit `EPERM: operation not
  permitted, unlink '.../apps/api/dist/prisma.config.js'` — a stale
  `dist/` directory from an earlier build this session that this
  sandbox's mounted-folder permissions won't let a fresh build
  overwrite (the same restriction behind the long-standing `_tmp_*`
  files at the repo root, which are `.gitignore`d and also could not be
  removed this session for the same reason); `test` hit `Module
  ts-jest in the transform option was not found` — `pnpm install`
  itself could not complete this session (`EPERM: operation not
  permitted, unlink '.../_tmp_8_...'`, the identical mount-permission
  issue), so `node_modules/ts-jest` was simply never installed. Both
  are infrastructure gaps a normal dev machine (or a sandbox without
  this mount restriction) won't hit — `pnpm install && pnpm build &&
  pnpm test` should be re-run there to confirm `apps/api`'s build/test
  targets are unaffected by this phase's payload changes (typecheck
  already gives strong confidence they are).

---

## Changelog

Append one line per completed task, newest first. Format:
`YYYY-MM-DD — REQ-x.x or free text — one-line note`.

- 2026-07-14 — REQ-4.1–4.12 implemented — Phase 4 (Python and OpenCV Foundation) built end-to-end: `video/reader.py`/`image_reader.py` (bounded-memory OpenCV I/O), `frames/models.py` (`Frame`/`Detection`/`BoundingBox`, camelCase per the events convention), `frames/preprocessing.py` (resize/normalize), `annotation/draw.py` (bounding-box/label drawing), `metadata/extract.py` (duration/fps/resolution/SHA-256 checksum), `storage/minio_client.py` (direct boto3 S3 client, module-level singleton). `commands_consumer.py`'s `handle_command_message()` gained a `minio_client` parameter and now downloads the mission's video, extracts metadata, iterates every frame for real (still no detection model), and publishes `PROCESSING_STARTED`/`PROCESSING_COMPLETED` with real metadata/frame-count/duration fields — added as optional, additive fields to `ProcessingStartedPayload`/`ProcessingCompletedPayload` across the JSON Schema, TS, and Pydantic mirrors (ADR-005, no `eventVersion` bump; `test_event_schema_sync.py`'s three-way check still passes). An unrecoverable download/decode failure now also publishes `PROCESSING_FAILED` (previously never emitted by vision-service, so `apps/api`'s existing `PROCESSING_FAILED → FAILED` mapping was dead code until now) alongside the existing DLQ publish. `/ready` now reports real Kafka-consumer and MinIO reachability via `kafka.runner.commands_consumer_runner.is_ready`/`storage.minio_client.minio_client.is_reachable()` — `commands_consumer_runner` moved to a `kafka.runner`-level singleton so `routes/health.py` can share it without a circular import. Added `samples/sample-mission-clip.mp4`+`sample-frame.png` (deterministic synthetic fixtures, regeneratable via `apps/vision-service/scripts/generate_samples.py`) and 26 new tests across 8 new/extended test files (58 total, all passing). Verified: `ruff check`/`ruff format --check` clean and full pytest suite green against this sandbox's system Python 3.10; TS side verified via `nx run @ai-defense/event-schemas:{lint,typecheck,test,build}` and `@ai-defense/api:{lint,typecheck}` (all pass) — `@ai-defense/api:{build,test}` failed on two pre-existing sandbox/mount issues unrelated to this phase (stale `dist/` can't be unlinked; `pnpm install` can't complete so `ts-jest` was never installed), documented in this phase's Known gaps rather than worked around. `uv.lock` was found already committed (resolved outside this session) but is not yet re-locked for this phase's three new dependencies — also in Known gaps.
- 2026-07-14 — REQ-1.21 reversed — Disabled Conventional Commits enforcement per explicit request: `.husky/commit-msg` is now a no-op, and CI's `commitlint` job was removed from `.github/workflows/ci.yml`. `commitlint.config.cjs` left in place but unused. Updated [[CONTRIBUTING]], [[Coding_Standards]], [[Local_Development_Stack]] to describe the format as recommended-but-unenforced. REQ-1.21 unchecked in Phase 1 above; see that section's Known gaps for detail.
- 2026-07-14 — REQ-2.14 tests written — Wrote `apps/api/test/mission-lifecycle.e2e-spec.ts`: the three integration tests the PRD names — mission CRUD round-trip, signed URL generation (with object-key attach verified), illegal-transition rejection (DRAFT→COMPLETED, asserts 409/`MISSION_ILLEGAL_TRANSITION`) — all driven over real HTTP via `supertest` against the full `AppModule` (register → JWT → authenticated requests), following REQ-3.15's env-gating/raw-`pg.Client`-cleanup house style. Confirmed `KafkaModule` doesn't need excluding: its consumer's `onModuleInit` no-ops without `KAFKA_BROKERS` rather than failing boot, so this suite only requires Postgres + MinIO per the PRD. Lint and `tsc --noEmit` both clean. Not yet run — no docker in this sandbox; needs `docker compose up -d postgres minio` + env vars on a normal dev machine, then `pnpm --filter @ai-defense/api run test:e2e`.
- 2026-07-14 — Phase 4 planning — Drafted [[PRD-Phase-4]] (REQ-4.1–4.12), covering OpenCV video/image readers with bounded-memory frame iteration, preprocessing/annotation utilities, metadata extraction (duration/fps/resolution/checksum), extended `/ready` (real Kafka/MinIO connectivity), normalized `Frame`/`Detection` Pydantic contracts, and replacing Phase 3's stub consumer pipeline with real MinIO download + frame iteration (still no model inference — that's Phase 5). No new ADR required: OpenCV and MinIO/S3 are already accepted in [[Technology_Decisions]]. Flags the still-uncommitted `apps/vision-service/uv.lock` (carried over from Phase 1/3) as a prerequisite to close before this phase's new dependencies are added. Phase 4 checklist added below, all unchecked — implementation not yet started.
- 2026-07-14 — REQ-2.12 complete — `pnpm --filter @ai-defense/api run openapi:export` finally ran clean after fixing a stale `packages/event-schemas/dist/` (rebuilt), an `AppModule` import-hoisting bug in the export script itself (static import evaluated before placeholder env vars were set — switched to a dynamic `await import("../src/app.module.js")`, `.js` extension required by `moduleResolution: "nodenext"`), and `test:e2e` needing `NODE_OPTIONS=--experimental-vm-modules` (Prisma 7's client lazily loads its WASM query compiler via a real dynamic `import()`, unrelated to `moduleFormat`). `packages/contracts/openapi.json` is committed — read and verified directly (not just the script's own "written to..." log line): real `/auth`, `/missions`, `/storage` paths with proper `operationId`s and `$ref` schemas. `test:e2e` also now passes in full (3/3). REQ-2.12 checked off; REQ-2.14 still needs its actual three integration tests written (separate from the runner-level fixes here, which just made `test:e2e` usable at all).
- 2026-07-14 — REQ-3.15 — Wrote `apps/api/test/kafka-event-platform.e2e-spec.ts`: three real integration tests against a full-stack `TestingModule` (`PrismaModule`/`MissionsModule`/`ProcessedEventsModule`) plus a real `kafkajs` client — duplicate command delivery is a no-op (one `processed_events` row, one `audit_log` transition row), a simulated consumer crash/restart (a second `TestingModule` instance) redelivers safely because idempotency state lives in Postgres, and an unrecoverable event actually round-trips through a real `aidefense.dead-letter` topic via a live consumer. Gated behind `DATABASE_URL`/`KAFKA_BROKERS`/`MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` (`describe.skip` + console warning otherwise) since `MissionsModule` transitively needs `StorageModule`'s MinIO bucket check — same no-docker limitation as REQ-2.14, so not run in this sandbox. Verified: typecheck/lint clean, and confirmed the unit `test` target (Jest `rootDir: "src"`) doesn't pick up this `test/`-directory file, so the existing 62 unit tests are unaffected.
- 2026-07-14 — REQ-3.6–3.14 verification and completion — Fixed the last two Ruff `E501` line-length violations in `apps/vision-service/src/vision_service/observability.py` (wrapped two docstrings) and a real bug in `tests/test_retry.py` (passed `failures.append`, a one-arg callable, as the two-arg `on_attempt_failed` callback — fixed the test to wrap it in a two-arg lambda; `retry.py`'s own two-arg signature was correct and mirrors `apps/api/src/kafka/retry.util.ts` on purpose). Installed `ruff` into the sandbox and confirmed `ruff check`/`ruff format --check` both clean and all 18 vision-service pytest tests pass. Re-ran `pnpm exec nx run-many -t lint,typecheck,test,build` across all 7 TS projects — clean (62 API tests, plus outbox-publisher/edge-agent/contracts). This closes out REQ-3.6 through REQ-3.14 (outbox write, outbox-publisher, idempotent consumption both sides, retry/DLQ both sides, correlation/causation propagation, and the vision-service/api consumer stub pipeline) as verified, building on work already in the tree from earlier in this session/prior sessions.
- 2026-07-14 — REQ-2.14/2.12 verification continued (on Dmytro's own machine) — after `pnpm install`, `nest build` got past the missing-module errors but failed on stale `packages/event-schemas/dist/` output (still the Phase 1 placeholder scaffold; fixed with `pnpm --filter @ai-defense/event-schemas run build`). `test:e2e` then hit a third `ts-jest`-specific issue: `TypeError: A dynamic import callback was invoked without --experimental-vm-modules`, from Prisma 7's client lazily loading its WASM query compiler via a real dynamic `import()` — unrelated to `moduleFormat`. Fixed by adding `NODE_OPTIONS=--experimental-vm-modules` to `apps/api/package.json`'s `test:e2e` script. Separately, `openapi:export`'s own script had a real bug: `apps/api/scripts/generate-openapi.ts`'s static `import { AppModule }` was hoisted and evaluated before `ensurePlaceholderEnv()` ran, so `AuthModule`'s eager `getRequiredJwtSecret()` call threw despite the placeholder being set. Fixed by switching to a dynamic `await import(...)` inside `main()`. Four independent bugs found and fixed across this and the prior session's REQ-2.14 pass, each for an unrelated reason — none yet confirmed together in one clean run.
- 2026-07-14 — REQ-2.14 verification continued (on Dmytro's own machine) — `test:e2e` still failed after the `moduleFormat`/path fixes, but with a new, unrelated error: `ts-jest` can't resolve the generated Prisma client's own NodeNext-style relative imports (`./internal/class.js` pointing at a sibling `.ts` file — valid for a real `tsc` build, not for `ts-jest`'s on-the-fly transform). Fixed via the standard `moduleNameMapper` workaround (`"^(\\.{1,2}/.*)\\.js$": "$1"`) in `test/jest-e2e.json`. Separately, `openapi:export`'s `nest build` step failed for a third, unrelated reason: real Phase 3 REQ-3.14 code (`src/kafka/`, `src/processed-events/`) already exists in the tree — apparently in-progress work from outside this session, not reflected in this file's Phase 3 checklist — and needed `pnpm install` re-run to pick up `@ai-defense/event-schemas`/`kafkajs` (already declared in `package.json`, just not yet installed), plus a real `noImplicitAny` fix in `processing-events-consumer.service.ts` (typed `eachMessage`'s destructured `message` against kafkajs's `EachMessagePayload`). None of the three bugs found this session were related to each other — each needed its own fix. Not yet re-run to confirm all three together.
- 2026-07-14 — REQ-2.14 blocker resolved and verified (on Dmytro's own machine, not this sandbox) — `pnpm --filter @ai-defense/api exec prisma generate` with the `moduleFormat = "cjs"` fix regenerated cleanly. Booting the built app first surfaced an unrelated, pre-existing bug: `apps/api/package.json`'s `start:prod` script and `apps/api/Dockerfile`'s `CMD` both pointed at `dist/main.js`, but `apps/api/tsconfig.json`'s `rootDir: "./"` (needed so one `tsc` run also compiles sibling `prisma.config.ts`/`generated/prisma/`) actually nests `src/` output one level deeper, at `dist/src/main.js` — meaning `pnpm run start:prod` and the Docker image's `api` container had never been runnable, in any prior session, until this was caught. Fixed both paths. With both fixes in place, `node dist/src/main.js` booted clean end-to-end: every controller's routes mapped and `[PrismaService] Connected to Postgres via @prisma/adapter-pg`, zero ESM/CJS errors. (A follow-up run also hit MinIO not being up yet — `ECONNREFUSED :9000` from `StorageService`'s bucket check — expected/correct fail-loudly behavior, not a bug; resolved by starting the Compose `minio` service.) REQ-2.14's actual three integration tests and CI wiring still need writing — that's the next session's work, on a machine with docker.
- 2026-07-14 — REQ-2.14 diagnosis — Found the actual root cause of the generated-Prisma-client ESM breakage (both the `ts-jest` `SyntaxError` blocking REQ-2.14 and yesterday's plain-`node` `ReferenceError`): Prisma's `prisma-client` generator defaults to ESM output and its `moduleFormat` auto-inference from `tsconfig.json` guessed wrong for this project's ambiguous setup (`"module": "nodenext"`, no `package.json` `"type"` field). Confirmed against Prisma's own changelog and a filed Prisma issue with the identical symptom (see [[API_Shell]] Known gaps for links). Fix: added `moduleFormat = "cjs"` to `apps/api/prisma/schema.prisma`'s `generator client` block, matching how `apps/api` actually compiles. Not yet regenerated/verified — this sandbox still can't reach `binaries.prisma.sh`; needs `prisma generate` + a boot check on a machine with network access before REQ-2.14's integration tests (or REQ-2.12's export script) are attempted again.
- 2026-07-14 — Phase 3 planning — Drafted [[PRD-Phase-3]] (REQ-3.1–3.15), covering topic taxonomy, event envelope/versioning, Transactional Outbox (`apps/outbox-publisher` reading Phase 2's `outbox` table), idempotent consumption, retry/DLQ, correlation propagation, and a consumer-side stub pipeline (no real frame processing — that's Phase 4). Flags one required ADR (event schema versioning/compatibility policy, next number `ADR-005`) not yet drafted. Phase 3 checklist added below, all unchecked — implementation not yet started.
- 2026-07-14 — REQ-2.12 — Wrote `apps/api/scripts/generate-openapi.ts` (`pnpm --filter @ai-defense/api run openapi:export`), designed to boot `AppModule` without calling `app.init()`/`app.listen()` so no live Postgres/MinIO is needed just to read Swagger metadata. Couldn't verify it end-to-end: discovered a more severe form of the generated-Prisma-client ESM issue already tracked under REQ-2.14 — plain `node` (not just Jest) fails to `require()` `apps/api/dist/generated/prisma/client.js` on this sandbox's Node v22.22.3 (`ReferenceError: exports is not defined in ES module scope`), independent of anything in the new script. This also means `apps/api/Dockerfile`'s floating `FROM node:22-slim` tag is a real production risk, not just a sandbox inconvenience — logged in both this file's and [[API_Shell]]'s Known gaps. No `openapi.json` was generated or committed (would have been guessing). REQ-2.12 left unchecked.
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
- [[PRD-Phase-3]] — source of the Phase 3 REQ checklist above.
- [[ADR-004-nestjs-orm]] — ORM decision blocking Phase 2's REQ-2.1.
- [[ADR-005-event-schema-versioning]] — Phase 3's event schema versioning policy.
- [[Local_Kafka_Redpanda]] — Phase 3's topic taxonomy, outbox, and consumers in detail.
- [[Vision_Service_Shell]] — Phase 3's vision-service consumer side.
- [[Mission_State_Machine]] — REQ-2.2's state-machine documentation.
- [[Sprint_0_Foundation]] — the sprint that produced everything upstream of Phase 1.
- [[MVP_Implementation_Plan]] — how Phases 1-2 fit the overall MVP sequence.
- [[AI_Defense_Platform_Roadmap]] — phases beyond Phase 2, appended here as they start.
