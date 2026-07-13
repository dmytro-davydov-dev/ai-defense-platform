---
title: "Phase 1 Testing Baseline"
type: testing
tags: [testing, phase1]
status: accepted
---

# Phase 1 Testing Baseline

Per the "Testing baseline" cross-cutting concern in
`docs/mvp-plan/MVP_Implementation_Plan.md`: every service ships with a
runnable test setup from Phase 1 onward, even before there's real
business logic to test. The full test-layer matrix (load, resilience,
security suites) remains Phase 13.

## Per-app setup today

| App/package | Runner | What's tested |
|---|---|---|
| `apps/web` | Vitest + Testing Library (jsdom) | `App` renders the Phase 1 placeholder shell |
| `apps/api` | Jest + Supertest | `HealthController` unit test; e2e test hits `/`, `/health`, `/ready` |
| `apps/vision-service` | pytest + FastAPI `TestClient` | `/health`, `/ready`, `/version` |
| `packages/*` (contracts, event-schemas, observability) | none yet | trivial `exit 0` test script — real tests land once each package has content (Phase 2/3) |
| `apps/outbox-publisher`, `apps/edge-agent` | none yet | trivial `exit 0` test script — stubs until Phase 3/9 |

Every TS project's `test` target is wired into
`.github/workflows/ci.yml`'s `nx affected -t test` step; every project
runs, even the ones that only assert "no tests yet" — so REQ-1.19's
"unit test" CI gate is real and enforced, not a placeholder that gets
skipped.

## What this establishes for later phases

- The pattern (co-located `*.spec.ts`/`*.test.tsx`/`test_*.py`,
  runnable via `pnpm test` / `uv run pytest`) is set once, so Phase 2-7
  add tests to existing suites rather than choosing new tooling per
  feature.
- Integration tests (Postgres, Kafka, MinIO adapters) and end-to-end
  tests (Playwright/Cypress) are explicitly *not* part of this baseline
  — they land with the features that need them (Phase 2's Postgres/MinIO
  integration tests, Phase 6's end-to-end mission flow test).

------------------------------------------------------------------------

## Related Notes

- [[PRD-Phase-1]] — REQ-1.14, REQ-1.19.
- [[Coding_Standards]] — the testing-expectations section this baseline
  implements.
- [[MVP_Implementation_Plan]] — "Testing baseline" cross-cutting concern.
