---
title: Web Shell
type: frontend
tags: [frontend, phase1, phase6]
status: accepted
---

# Web Shell

`apps/web` — scaffolded as a Phase 1 placeholder
(`docs/mvp-plan/PRD-Phase-1.md`, REQ-1.3), built out into the real
operator Mission Workspace in Phase 6
(`docs/mvp-plan/PRD-Phase-6.md`, REQ-6.6–6.18).

## What exists today

- **React 18 + TypeScript + Vite** shell (Phase 1), now a routed
  application: React Router (`createBrowserRouter`) drives `/login`,
  `/missions`, and `/missions/:missionId`; every workspace route renders
  inside `AppLayout` behind `ProtectedRoute` (REQ-6.7).
- **State**: Redux Toolkit (`app/store.ts`) holds two slices — `auth`
  (JWT + user, persisted to `sessionStorage`, REQ-6.7/6.8's resolved
  open question) and RTK Query's own `api` reducer.
- **API layer** (`api/apiSlice.ts`, `api/types.ts`): a single
  `createApi` instance covering auth, mission CRUD/transition/upload-url,
  detections, audit-log, and the generic storage download-url endpoint.
  **Hand-written, not `@rtk-query/codegen-openapi` output** — see
  `types.ts`'s header comment and this phase's Known gaps in
  [[Progress]]; each type is annotated with the exact `apps/api` DTO
  file it mirrors, and `pnpm --filter @ai-defense/web run codegen:api`
  is wired up (against `packages/contracts/openapi.json`) for whenever
  a machine can actually run it and `apps/api`'s spec has been
  re-exported with this phase's new endpoints.
- **Design system**: Material UI (dark theme, `app/theme.ts`) — no
  bespoke CSS beyond a minimal reset (`index.css`); `App.css` is now
  empty (superseded by MUI's `CssBaseline`).
- **Real-time**: `features/realtime/useMissionSocket.ts`, a
  `socket.io-client` hook that joins `apps/api`'s `MissionEventsGateway`
  (REQ-6.5) per open mission detail view and invalidates that mission's
  RTK Query tags on every relayed event — no hand-rolled cache patching,
  just an extra REST round trip per event (REQ-6.12).
- **Mission workspace features**: mission list/create/detail/edit
  (`features/missions/`), the state-machine-aware transition controls
  (`missionStateMachine.ts` mirrors `apps/api`'s own table by hand),
  direct-to-MinIO upload with progress (`UploadPanel.tsx`, `XMLHttpRequest`
  for upload-progress events), a canvas-overlay video player synced to
  `<video>`'s own clock (`features/video/VideoPlayerWithOverlay.tsx`),
  an event timeline merging audit rows + a detections summary
  (`EventTimeline.tsx`), basic stats (`StatsPanel.tsx`), and a dedicated
  audit-trail view (`AuditTrailView.tsx`).
- Vitest + Testing Library (unit tests for `authSlice`,
  `missionStateMachine`, `errors.ts`, and an `App.test.tsx` smoke test);
  Playwright (`playwright.config.ts`, `e2e/mission-workflow.spec.ts`) for
  the one REQ-6.18 critical-path test.
- Lint/format via `@ai-defense/eslint-config/react`; strict TypeScript
  via `@ai-defense/ts-config/react-app.json` (`tsconfig.node.json` now
  also covers `playwright.config.ts`/`e2e/`).

## What's deliberately not here yet

- No map/GIS rendering — Phase 7.
- No role beyond the two flat ones (`operator`/`admin`) — no per-mission
  ownership check in the UI, matching `apps/api`'s current RBAC model
  (Security_Baseline.md).
- Mission "duration" in `StatsPanel.tsx` is `updatedAt - createdAt`, not
  the pipeline's own `processingDurationMs` — that field is emitted on
  `PROCESSING_COMPLETED` but not yet persisted anywhere `apps/api` can
  read back; see [[Progress]]'s Phase 6 Known gaps.
- The event timeline shows one summarizing row for detections, not one
  row per detection (a processed mission can have hundreds) — per-
  detection detail lives in the video overlay and stats panel instead.

------------------------------------------------------------------------

## Related Notes

- [[PRD-Phase-1]] — REQ-1.3, REQ-1.8.
- [[PRD-Phase-6]] — the requirements this build-out implements.
- [[MVP_Implementation_Plan]] — Phase 6 (Frontend Mission Workspace).
- [[Architecture_Overview]] — the React Workspace container this app
  implements.
- [[Repository_Structure]] — `apps/web` placement.
- [[Security_Baseline]] — RBAC model the UI's role-gated controls follow.
- [[Progress]] — Phase 6's implementation status and Known gaps.
