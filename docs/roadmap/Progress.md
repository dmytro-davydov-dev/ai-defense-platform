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

- [ ] REQ-1.1 — pnpm/npm workspace spans all TS apps and packages
- [ ] REQ-1.2 — Nx/Turborepo selected via ADR and wired for build/lint/test

### Application shells

- [ ] REQ-1.3 — `apps/web` React+Vite shell builds and serves
- [ ] REQ-1.4 — `apps/api` NestJS shell builds and starts
- [ ] REQ-1.5 — `apps/vision-service` FastAPI shell builds and starts
- [ ] REQ-1.6 — `apps/outbox-publisher` stub scaffold
- [ ] REQ-1.7 — `apps/edge-agent` stub scaffold
- [ ] REQ-1.8 — every shell exposes `/health` and `/ready` (HTTP 200)

### Shared packages

- [ ] REQ-1.9 — `packages/contracts` scaffold
- [ ] REQ-1.10 — `packages/event-schemas` scaffold
- [ ] REQ-1.11 — `packages/ts-config` and `packages/eslint-config`
- [ ] REQ-1.12 — `packages/observability` stub

### Python workspace

- [ ] REQ-1.13 — `pyproject.toml` via chosen dependency manager (ADR)
- [ ] REQ-1.14 — Ruff + pytest configured, runnable
- [ ] REQ-1.15 — Python 3.12+ pinned

### Local infrastructure

- [ ] REQ-1.16 — Compose starts Postgres+PostGIS, Kafka, MinIO + 3 shells
- [ ] REQ-1.17 — all services reach healthy with no manual steps
- [ ] REQ-1.18 — no hardcoded secrets; `.env.example` committed

### Quality gates (CI)

- [ ] REQ-1.19 — CI runs lint → typecheck → test → build → docker build
- [ ] REQ-1.20 — CI failure blocks merge
- [ ] REQ-1.21 — Conventional Commits enforced via commitlint

### Developer experience and docs

- [ ] REQ-1.22 — root README documents setup/compose/dev commands
- [ ] REQ-1.23 — pre-commit hooks run lint/format
- [ ] REQ-1.24 — branch/release strategy documented

**Phase 1 exit:** all boxes above checked, plus the Definition of Done
in [[PRD-Phase-1]] Section 8.

---

## Changelog

Append one line per completed task, newest first. Format:
`YYYY-MM-DD — REQ-x.x or free text — one-line note`.

- 2026-07-13 — setup — Progress.md created; Phase 1 checklist seeded from [[PRD-Phase-1]].

---

## Related Notes

- [[PRD-Phase-1]] — source of the REQ checklist above.
- [[Sprint_0_Foundation]] — the sprint that produced everything upstream of Phase 1.
- [[MVP_Implementation_Plan]] — how Phase 1 fits the overall MVP sequence.
- [[AI_Defense_Platform_Roadmap]] — phases beyond Phase 1, appended here as they start.
