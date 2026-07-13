---
title: "ADR-001: Monorepo tooling — pnpm workspaces + Nx"
type: adr
tags: [adr, repository, phase1]
status: accepted
---

# ADR-001: Monorepo tooling — pnpm workspaces + Nx

- Status: Accepted
- Date: 2026-07-13
- Decision owners: Dmytro
- Related documents: [[PRD-Phase-1]], [[Repository_Structure]], [[Coding_Standards]]

## Context

Phase 1 bootstraps a monorepo spanning three runtime apps (`web`, `api`,
`vision-service`), two forward-looking stubs (`outbox-publisher`,
`edge-agent`), and five shared TypeScript packages (`contracts`,
`event-schemas`, `ts-config`, `eslint-config`, `observability`). Every
later MVP phase (2–7) adds more apps, packages, and cross-package
dependencies (e.g. `apps/api` and `apps/vision-service` both depend on
`packages/event-schemas`).

REQ-1.1 requires a single package manager workspace. REQ-1.2 requires a
monorepo build tool selected via ADR for build/lint/test orchestration.
The tool needs to: dedupe installs across TS packages, understand the
dependency graph between `packages/*` and `apps/*`, cache task output so
CI doesn't rebuild/retest untouched packages on every PR, and stay
lightweight enough that its configuration doesn't outweigh the (still
mostly empty) code it orchestrates.

## Decision

Use **pnpm workspaces** for package management and **Nx** for task
orchestration, dependency-graph awareness, and caching.

- `pnpm-workspace.yaml` declares `apps/*` and `packages/*` as workspace
  packages.
- `nx.json` defines the task pipeline (`build`, `lint`, `typecheck`,
  `test`) with `dependsOn` wiring so a package only rebuilds when its
  inputs change, and downstream consumers rebuild after it.
- Nx's project graph is used to determine "affected" projects in CI
  (REQ-1.19: lint → type-check → unit test → build "per affected
  app/package").
- Python (`apps/vision-service`) is intentionally kept outside the
  pnpm/Nx graph — it is managed independently via `uv` per ADR-002 and
  invoked as a separate CI job, not as an Nx target.

## Alternatives considered

### Alternative A — pnpm workspaces + Turborepo

Turborepo has a smaller config surface and is faster to learn than Nx.
For Phase 1's small graph (3 real apps, 2 stubs, 5 packages) it would be
sufficient. Rejected in favor of Nx because Nx's generators, richer
dependency-graph tooling (`nx graph`), and module-boundary
enforcement (`nx lint` rules restricting which packages may import which)
give more leverage as the MVP grows through Phases 2–7, and the team
would rather absorb Nx's steeper initial learning curve once, in Phase 1,
than migrate later.

### Alternative B — Plain npm/pnpm workspaces, no build tool

Simplest possible setup: no extra tool, just `pnpm -r build`. Rejected
because it has no task caching or affected-project detection — every CI
run would lint/build/test every package regardless of what changed,
which gets slow and provides no incremental-build story as Phases 2–7
add real code.

## Consequences

### Positive

- Task caching (local and CI-remote-cacheable later) keeps CI fast as
  the monorepo grows.
- `nx affected` gives precise "only touched projects" CI runs, directly
  satisfying REQ-1.19.
- Dependency-graph enforcement prevents accidental layering violations
  (e.g. `packages/contracts` importing from `apps/api`).
- pnpm's content-addressable store keeps installs fast and disk-light
  across many small packages.

### Negative

- Nx adds a non-trivial config surface (`nx.json`, per-project
  `project.json` or `package.json` `nx` blocks) that must be understood
  by anyone touching the monorepo.
- Two ecosystems now exist in the repo (Nx-orchestrated TS, uv-managed
  Python) rather than one unified tool.

### Risks

- Over-configuring Nx before there is real code to orchestrate — see
  PRD risk "Monorepo tooling choice adds complexity before value."
  Mitigation: keep `nx.json` to the minimal `build`/`lint`/`typecheck`/
  `test` pipeline in Phase 1; do not add generators, remote caching, or
  module-boundary lint rules until a later phase needs them.

## Migration and rollback

If Nx proves to be more overhead than value, the workspace can fall back
to plain `pnpm -r <script>` since pnpm workspaces remain the source of
truth for package resolution; Nx is additive orchestration on top, not a
replacement for the package manager. Removing `nx.json` and the `nx`
devDependency does not require restructuring `apps/` or `packages/`.

## Review date

Revisit at the start of Phase 8 (or sooner if Nx configuration
overhead becomes a recurring complaint in PR review).

---

## Related Notes

- [[PRD-Phase-1]] — REQ-1.1/1.2 require this decision.
- [[ADR-002-python-dependency-manager]] — the Python-side counterpart,
  deliberately kept outside this Nx graph.
- [[Repository_Structure]] — the `apps/`/`packages/` layout this tooling
  orchestrates.
