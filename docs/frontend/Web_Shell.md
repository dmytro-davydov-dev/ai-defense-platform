---
title: Web Shell
type: frontend
tags: [frontend, phase1, phase6, phase7]
status: accepted
---

# Web Shell

`apps/web` — scaffolded as a Phase 1 placeholder
(`docs/mvp-plan/PRD-Phase-1.md`, REQ-1.3), built out into the real
operator Mission Workspace in Phase 6
(`docs/mvp-plan/PRD-Phase-6.md`, REQ-6.6–6.18), with a geospatial map
container added in Phase 7
(`docs/mvp-plan/PRD-Phase-7.md`, REQ-7.4–7.7).

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
- **Geospatial** (`features/telemetry/`): `MissionMap.tsx` integrates
  MapLibre GL JS directly (no `react-map-gl` wrapper, per
  [[ADR-007-map-library-choice]]) against a token-free OpenStreetMap
  raster basemap, rendering a mission's telemetry route (REQ-7.3/7.5) as
  a line layer, each persisted detection (REQ-6.1/6.2) as a
  nearest-in-time point marker, and a current-position marker synced to
  `VideoPlayerWithOverlay`'s own playback clock (lifted up via a new
  `onTimeUpdate` prop, REQ-7.6). `nearestInTime.ts` is the pure
  nearest-neighbor matching utility, with its video/telemetry
  start-alignment assumption documented in its own header comment — the
  one real modeling caveat this phase introduces (see [[Progress]]'s
  Known gaps). Every rendered geolocation carries a persistent
  "Approximate position" chip (REQ-7.7) — not just a one-time tooltip.
  `TelemetryUploadPanel.tsx` uploads a CSV or GeoJSON file per mission
  (REQ-7.2), format auto-detected server-side.
- Vitest + Testing Library (unit tests for `authSlice`,
  `missionStateMachine`, `errors.ts`, `nearestInTime.ts`, and an
  `App.test.tsx` smoke test); Playwright (`playwright.config.ts`,
  `e2e/mission-workflow.spec.ts`) for the REQ-6.18/7.9 critical-path
  test (now also covers telemetry upload + map rendering).
- Lint/format via `@ai-defense/eslint-config/react`; strict TypeScript
  via `@ai-defense/ts-config/react-app.json` (`tsconfig.node.json` now
  also covers `playwright.config.ts`/`e2e/`).

## What's deliberately not here yet

- Geofences, full spatial queries, uncertainty-radius indicators, and
  multi-mission map overlay — the roadmap's fuller Phase 7 scope,
  explicitly deferred past the MVP (`docs/mvp-plan/PRD-Phase-7.md`
  Section 4).
- True interpolation-based route replay — the map's video-scrub sync
  and detection markers are nearest-neighbor matches only, per
  `nearestInTime.ts`'s documented assumption.
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
- [[PRD-Phase-7]] — the geospatial requirements this build-out extends.
- [[ADR-007-map-library-choice]] — MapLibre GL JS + OSM raster tiles decision.
- [[MVP_Implementation_Plan]] — Phase 6 (Frontend Mission Workspace), Phase 7 (GIS and Telemetry, MVP slice).
- [[Architecture_Overview]] — the React Workspace container this app
  implements.
- [[Repository_Structure]] — `apps/web` placement.
- [[Security_Baseline]] — RBAC model the UI's role-gated controls follow.
- [[Progress]] — Phase 6/7's implementation status and Known gaps.
