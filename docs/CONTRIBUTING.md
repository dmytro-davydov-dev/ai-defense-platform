---
title: Contributing
type: contributing
tags: [contributing, process]
status: accepted
---

# Contributing

## Branch strategy

- `main` is always releasable; direct pushes are disabled — all changes
  land via pull request.
- Branch names: `<type>/<short-description>`, matching the Conventional
  Commit type of the change (e.g. `feat/mission-crud`,
  `fix/outbox-retry`, `docs/adr-004`).
- Keep PRs small and reviewable, per
  `docs/architecture/Coding_Standards.md`. A PR should map to one
  logical change, not a whole phase.
- Rebase (not merge-commit) onto `main` before requesting review, to
  keep history linear and Conventional-Commit-clean.
- Squash-merge on completion so `main` gets one Conventional Commit per
  PR; the PR title becomes the squash commit message and must itself
  follow Conventional Commits.

## Release strategy

- Phase 1 has no release artifact beyond `main` being green — every
  merged PR is deployable to the local Compose stack by definition
  (CI's docker-build job proves the images build).
- Tagged releases (`vX.Y.Z`) start once Phase 2 ships a real API
  surface worth versioning; until then, `main` is the source of truth.
- Any significant architectural change requires an ADR under
  `docs/adr/` before or alongside the PR that implements it, per
  `docs/architecture/Coding_Standards.md`.

## Conventional Commits

**No longer enforced (2026-07-14)** — the `commit-msg` Husky hook and
CI's `commitlint` job were both disabled per explicit request; see
`docs/roadmap/Progress.md` Known gaps for the reversal note.
`commitlint.config.cjs` is still present but unused. The format below
remains the house style/recommendation, just not machine-checked:

```text
<type>(<optional scope>): <description>

[optional body]

[optional footer]
```

Common types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`,
`build`. Example: `feat(api): add mission CRUD endpoints`.

## Local setup

See the root `README.md` for `docker compose up` and per-app dev
commands.

After cloning, run once:

```bash
pnpm install   # installs Husky hooks via the root "prepare" script
```

Pre-commit runs Prettier/ESLint on staged TS files (`lint-staged`) and
Ruff on staged Python files under `apps/vision-service`. Commit message
validation (commitlint on `commit-msg`) is disabled — see Conventional
Commits above.

## Pull request checklist

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` pass
      locally (or rely on CI's `nx affected` equivalents).
- [ ] `uv run ruff check .`, `uv run pytest` pass in
      `apps/vision-service` if Python files changed.
- [ ] New/changed contracts or events are versioned
      (`docs/architecture/Coding_Standards.md`).
- [ ] A significant architectural change includes an ADR, updated
      diagrams, and migration/rollback notes.
- [ ] No secrets committed; `.env.example` updated if new config was
      added.

---

## Related Notes

- [[Coding_Standards]] — PR size, ADR trigger, versioning rules referenced above.
- [[PRD-Phase-1]] — REQ-1.21 (Conventional Commits), REQ-1.23 (pre-commit hooks), REQ-1.24 (branch/release strategy).
- [[Repository_Structure]] — where ADRs and other governed docs live.
