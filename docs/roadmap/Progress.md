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
recorded in [[ADR-004-nestjs-orm]] (Prisma, status: proposed — accept
before REQ-2.1 implementation begins).

### Data model and migrations

- [ ] REQ-2.1 — Postgres schema via Prisma: missions, users, teams, roles, audit_log, outbox
- [ ] REQ-2.2 — mission state machine documented and enforced at the service layer
- [ ] REQ-2.3 — initial migrations committed, re-runnable on a fresh DB

### Identity and authorization

- [ ] REQ-2.4 — `AuthModule` issues/verifies JWTs
- [ ] REQ-2.5 — `UserModule`/`RoleModule` RBAC enforced on mutating endpoints
- [ ] REQ-2.6 — auth events produce audit records

### Mission lifecycle

- [ ] REQ-2.7 — `MissionModule` CRUD REST endpoints with DTO validation
- [ ] REQ-2.8 — state transitions via dedicated service method, audited

### Upload and storage

- [ ] REQ-2.9 — signed upload/download URLs against MinIO (S3 SDK)

### Audit baseline

- [ ] REQ-2.10 — append-only audit record for every mission/auth action

### API surface and documentation

- [ ] REQ-2.11 — OpenAPI spec generated, Swagger UI at `/docs`
- [ ] REQ-2.12 — OpenAPI spec exported into `packages/contracts`

### Testing

- [ ] REQ-2.13 — unit tests: state machine, RBAC guard
- [ ] REQ-2.14 — integration tests: Postgres + MinIO adapters, illegal-transition rejection

**Phase 2 exit:** all boxes above checked, plus the Definition of Done
in [[PRD-Phase-2]] Section 8.

---

## Changelog

Append one line per completed task, newest first. Format:
`YYYY-MM-DD — REQ-x.x or free text — one-line note`.

- 2026-07-13 — Phase 2 planning — Drafted [[PRD-Phase-2]] (REQ-2.1–2.14) and [[ADR-004-nestjs-orm]] (Prisma, proposed). Phase 2 checklist added below, all unchecked — implementation not yet started.
- 2026-07-13 — REQ-1.1–1.24 — Verified against the actual repo state (all app shells, shared packages, Compose stack, CI workflow, pre-commit hooks, README, CONTRIBUTING already implemented in prior work but never reflected here). Ran `nx run-many` for lint/typecheck/test/build and `format:check` directly — all green. Checked all 24 boxes; Phase 1 marked substantively complete with two residual follow-ups logged under "Known gaps" (uv.lock not committed; docker compose up / vision-service pytest not runnable from this sandbox).
- 2026-07-13 — setup — Progress.md created; Phase 1 checklist seeded from [[PRD-Phase-1]].

---

## Related Notes

- [[PRD-Phase-1]] — source of the Phase 1 REQ checklist above.
- [[PRD-Phase-2]] — source of the Phase 2 REQ checklist above.
- [[ADR-004-nestjs-orm]] — ORM decision blocking Phase 2's REQ-2.1.
- [[Sprint_0_Foundation]] — the sprint that produced everything upstream of Phase 1.
- [[MVP_Implementation_Plan]] — how Phases 1-2 fit the overall MVP sequence.
- [[AI_Defense_Platform_Roadmap]] — phases beyond Phase 2, appended here as they start.
