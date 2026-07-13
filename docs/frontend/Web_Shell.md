---
title: Web Shell
type: frontend
tags: [frontend, phase1]
status: accepted
---

# Web Shell

`apps/web` — Phase 1 scaffold only (`docs/mvp-plan/PRD-Phase-1.md`,
REQ-1.3). The real Mission Workspace (auth, mission list/detail, upload
flow, video overlays, GIS) is built in Phase 6
(`docs/mvp-plan/MVP_Implementation_Plan.md`).

## What exists today

- React 18 + TypeScript + Vite, scaffolded via `pnpm create vite`.
- A single placeholder page (`src/App.tsx`) — no routing, state
  management, or API calls yet.
- `server.js`: a small Express static server used only in
  production/Compose to serve the built `dist/` bundle and expose
  `/health` and `/ready` (REQ-1.8) — plain `vite dev` is used for local
  development instead.
- Vitest + Testing Library wired for unit tests (`src/App.test.tsx` is a
  trivial smoke test).
- Lint/format via `@ai-defense/eslint-config/react` and the root
  Prettier config; strict TypeScript via `@ai-defense/ts-config/react-app.json`.

## What's deliberately not here yet

- No routing library, state management, or design system choice has
  been made — those are Phase 6 decisions.
- No calls into `apps/api`; `@ai-defense/contracts` is still an empty
  scaffold (populated in Phase 2 once the API's OpenAPI spec exists).
- No auth screens.

------------------------------------------------------------------------

## Related Notes

- [[PRD-Phase-1]] — REQ-1.3, REQ-1.8.
- [[MVP_Implementation_Plan]] — Phase 6 (Frontend Mission Workspace) is
  where this shell becomes the real operator UI.
- [[Architecture_Overview]] — the React Workspace container this app
  implements.
- [[Repository_Structure]] — `apps/web` placement.
