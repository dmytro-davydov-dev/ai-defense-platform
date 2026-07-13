---
title: "PRD — Phase 1: Repository and Engineering Foundation"
type: prd
tags: [mvp, prd, phase1]
status: draft
---

# PRD — Phase 1: Repository and Engineering Foundation

Version: 1.0
Status: Draft
Date: 2026-07-13
Owner: Dmytro
Related documents: [[MVP_Implementation_Plan]], [[AI_Defense_Platform_Roadmap]], [[Repository_Structure]], [[Coding_Standards]]

---

## 1. Summary

Phase 1 bootstraps the AI Defense Platform monorepo: application shells,
shared packages, local infrastructure via Docker Compose, and CI quality
gates. It produces no user-facing features. Its output is a repository
that runs end-to-end as empty, healthy services, with the engineering
scaffolding every later phase depends on.

## 2. Problem statement

The repository currently contains only architecture documentation
(`docs/`) and empty placeholder folders (`apps/`, `packages/`). No code,
no local environment, and no CI exist yet. Every subsequent MVP phase
(identity, Kafka, vision processing, frontend, GIS) requires a working
monorepo, a local Postgres/Kafka/MinIO stack, and enforced quality gates
to build on. Without this foundation, later phases would each invent
their own tooling and conventions ad hoc, which the risk register flags
directly: _"Architecture documentation diverges from code."_

## 3. Goals

- A single monorepo that builds, lints, type-checks, and tests all
  services in CI.
- Empty but running application shells for web, api, and vision-service.
- A local Docker Compose stack providing PostgreSQL+PostGIS, Kafka, and
  MinIO alongside the app shells.
- Shared, reusable packages (contracts, event schemas, lint/TS config,
  observability stub) that later phases import rather than reinvent.
- Documented, enforced coding and commit conventions from day one.

## 4. Non-goals (explicitly out of scope for Phase 1)

- Any business logic: mission CRUD, auth, Kafka producers/consumers,
  detection, or UI screens (Phases 2–7).
- Kubernetes or any non-local deployment target (Phase 12).
- Full observability stack — dashboards, tracing backends (Phase 11).
- Full security hardening — OIDC, mTLS, threat model (Phase 10).

## 5. Requirements

### 5.1 Monorepo tooling

- REQ-1.1: A single package manager workspace (pnpm or npm workspaces)
  spans all TypeScript apps and packages.
- REQ-1.2: A monorepo build tool (Turborepo, Nx, or equivalent) is
  selected via ADR and wired for build/lint/test task orchestration.

### 5.2 Application shells

- REQ-1.3: `apps/web` — React + Vite + TypeScript shell, builds and
  serves a placeholder page.
- REQ-1.4: `apps/api` — NestJS shell, builds and starts.
- REQ-1.5: `apps/vision-service` — Python + FastAPI shell, builds and
  starts.
- REQ-1.6: `apps/outbox-publisher` — empty stub scaffold (implemented in
  Phase 3).
- REQ-1.7: `apps/edge-agent` — empty stub scaffold (implemented in
  Phase 9).
- REQ-1.8: Every shell exposes `/health` and `/ready` endpoints
  returning HTTP 200 once started.

### 5.3 Shared packages

- REQ-1.9: `packages/contracts` — scaffold for shared TS types /
  OpenAPI-generated contracts, empty but importable.
- REQ-1.10: `packages/event-schemas` — scaffold for Kafka event schema
  definitions (populated in Phase 3).
- REQ-1.11: `packages/ts-config` and `packages/eslint-config` — shared,
  strict TypeScript and lint configuration consumed by every TS app.
- REQ-1.12: `packages/observability` — stub for future OpenTelemetry
  wiring (populated incrementally from Phase 1 onward per the
  Observability baseline below).

### 5.4 Python workspace

- REQ-1.13: `pyproject.toml` at the vision-service root using the
  dependency manager selected via ADR (uv or Poetry).
- REQ-1.14: Ruff configured for linting/formatting; pytest configured
  and runnable with zero tests passing trivially.
- REQ-1.15: Python 3.12+ pinned per Coding_Standards.md.

### 5.5 Local infrastructure (Docker Compose)

- REQ-1.16: `infrastructure/compose/docker-compose.yml` starts
  PostgreSQL+PostGIS, Kafka (distribution per ADR), and MinIO alongside
  `apps/web`, `apps/api`, and `apps/vision-service`.
- REQ-1.17: All services in Compose reach a healthy state without
  manual intervention (`docker compose up` is sufficient).
- REQ-1.18: No secrets are hardcoded; configuration is sourced from
  `.env` files, with `.env.example` committed and documented.

### 5.6 Quality gates (CI)

- REQ-1.19: GitHub Actions pipeline runs on every PR: lint → type-check
  → unit test → build → docker build, per affected app/package.
- REQ-1.20: CI fails the PR if any gate fails; passing CI is required
  before merge.
- REQ-1.21: Conventional Commits are enforced via commitlint (or
  equivalent) per Coding_Standards.md.

### 5.7 Developer experience and documentation

- REQ-1.22: Root `README.md` documents local setup, `docker compose up`,
  and per-app dev commands.
- REQ-1.23: Pre-commit hooks run lint/format checks before commit.
- REQ-1.24: Branch and release strategy is documented (e.g., in
  `CONTRIBUTING.md` or an ADR).

## 6. Technical approach (ordered task list)

1. Initialize workspace tooling (package manager + monorepo build tool
   per ADR).
2. Scaffold `apps/web`, `apps/api`, `apps/vision-service` as empty
   shells; scaffold `apps/outbox-publisher` and `apps/edge-agent` as
   stubs.
3. Scaffold `packages/contracts`, `packages/event-schemas`,
   `packages/ts-config`, `packages/eslint-config`,
   `packages/observability`.
4. Set up the Python workspace: dependency manager, Ruff, pytest.
5. Write `infrastructure/compose/docker-compose.yml` wiring Postgres +
   PostGIS, Kafka, MinIO, and the three app shells.
6. Add `/health` and `/ready` endpoints to every service shell.
7. Configure ESLint + Prettier (TS) and Ruff (Python); add pre-commit
   hooks.
8. Configure GitHub Actions CI quality gates.
9. Document branch/release strategy; enforce Conventional Commits.
10. Add `.env.example` and startup config validation.
11. Update root `README.md` with local dev instructions.

## 7. ADRs required before/during Phase 1

1. Monorepo tooling (Turborepo vs Nx vs plain workspaces).
2. Python dependency manager (uv vs Poetry).
3. Kafka distribution for local Compose (Confluent vs Redpanda vs
   Bitnami/KRaft) — decided now even though Kafka isn't wired until
   Phase 3, since Compose must include it in Phase 1.

Use `docs/adr/ADR-000-template.md` for each.

## 8. Success criteria / Definition of Done

- `docker compose up` boots Postgres+PostGIS, Kafka, MinIO, web, api,
  and vision-service with no manual steps.
- All three app shells return HTTP 200 on `/health`.
- A trivial PR (e.g., a comment change) goes green through the full CI
  pipeline: lint, type-check, unit test, build, docker build.
- No secrets exist in the repository; `.env.example` is present and
  accurate.
- README accurately describes how to run the stack locally.

## 9. Dependencies

- None upstream — this is the first implementation phase.
- Blocks: Phase 2 (Core Platform and Identity), which builds directly on
  the `apps/api` shell, the Postgres instance, and CI gates established
  here.

## 10. Risks

| Risk                                                   | Mitigation                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| Monorepo tooling choice adds complexity before value   | Keep initial config minimal; document rationale in ADR-1           |
| Scope creep into Phase 2 business logic                | Enforce non-goals above; PR review checks for out-of-scope changes |
| CI pipeline becomes slow/flaky before real code exists | Keep pipeline lean now; expand thoughtfully in later phases        |

(See also [[Initial_Risk_Register]] for platform-wide risks.)

## 11. Open questions

- Final choice of monorepo tool, Python dependency manager, and Kafka
  distribution — to be resolved via the ADRs listed in Section 7 before
  implementation begins.

---

## Relationship to other documents

- Derived from the "Phase 1 — Repository and Engineering Foundation"
  section of [[MVP_Implementation_Plan]].
- Exit criteria align with Phase 1 in [[AI_Defense_Platform_Roadmap]].
- Structure follows [[ADR-000-template]] conventions adapted for a
  phase-level PRD rather than a single decision.

---

## Related Notes

- [[MVP_Implementation_Plan]]
- [[AI_Defense_Platform_Roadmap]]
- [[Repository_Structure]]
- [[Coding_Standards]]
- [[Initial_Risk_Register]]
- [[ADR-000-template]]
