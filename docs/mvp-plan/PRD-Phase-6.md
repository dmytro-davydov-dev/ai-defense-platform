---
title: "PRD — Phase 6: Frontend Mission Workspace"
type: prd
tags: [mvp, prd, phase6]
status: draft
---

# PRD — Phase 6: Frontend Mission Workspace

Version: 1.0
Status: Draft
Date: 2026-07-15
Owner: Dmytro
Related documents: [[MVP_Implementation_Plan]], [[AI_Defense_Platform_Roadmap]], [[PRD-Phase-2]], [[PRD-Phase-3]], [[PRD-Phase-5]], [[Web_Shell]], [[Security_Baseline]], [[Technology_Decisions]], [[Coding_Standards]], [[Mission_State_Machine]], [[Initial_Risk_Register]], [[Guiding_Principles]]

---

## 1. Summary

Phase 6 turns `apps/web` from the Phase 1 placeholder shell ([[Web_Shell]]:
"a single placeholder page... no routing, state management, or API
calls yet") into the operator-facing Mission Workspace — the roadmap's
named MVP goal "interactive web interface." It builds auth screens,
mission list/detail/create/upload flows, a live-updating status view
over Phase 3's Kafka events, a video player with a detection overlay
over Phase 5's real detections, an event timeline, and an audit-trail
view. It also closes three read-path gaps in `apps/api` that Phase 2/5
never needed until now: nothing today persists `aidefense.detections`
for later querying, nothing exposes `audit_log` for reading, and
nothing issues a signed *download* URL (only upload). Phase 6 cannot
be a frontend-only phase — it must add those three thin backend
read paths first, then build the UI on top of them.

## 2. Problem statement

`apps/api`'s OpenAPI spec (`packages/contracts/openapi.json`) already
covers auth, mission CRUD/transitions, and signed upload URLs
(REQ-2.11/2.12), explicitly "ready for `@rtk-query/codegen-openapi`'s
`schemaFile` once Phase 6 exists" ([[Progress]]). But three things the
frontend needs do not exist anywhere in the stack yet:

- **Detections are not persisted for query.** Phase 5's
  `commands_consumer.py` publishes one `DETECTION_PUBLISHED` event per
  retained detection to `aidefense.detections` (REQ-5.6), but no
  consumer reads that topic on the `apps/api` side — there is no
  `detections` table and no REST endpoint. A video player cannot render
  a detection overlay, and a stats view cannot compute "detections by
  class," without a way to read a mission's full detection history
  after processing completes, not just live off the wire.
- **The audit trail is write-only.** `AuditModule` (REQ-2.10) has
  written an append-only `audit_log` row for every mission/auth action
  since Phase 2, but no controller reads it. The roadmap's Phase 6
  "audit visibility" capability and the MVP plan's "audit-trail view
  per mission" step both depend on a read path that has never been
  built.
- **There is no signed download URL.** `StorageService`/
  `StorageController` (REQ-2.9) only issue presigned *upload* URLs. A
  video player needs a presigned GET against the mission's source video
  object key and Phase 5's `missions/{missionId}/annotated.mp4`
  artifact — that capability does not exist.
- **There is no real-time channel to the browser.** `apps/api` speaks
  REST (HTTP) and Kafka (broker-to-broker); nothing relays
  `aidefense.processing-events` or `aidefense.detections` to a
  connected browser tab. Without it, the workspace can only poll.

Until these four gaps close, Phase 6's UI has an OpenAPI spec to build
CRUD screens against but no way to show live status, no way to show
what a mission actually detected, and no way to show who did what.

## 3. Goals

- A real `apps/web` application — routing, a Material UI theme, a
  Redux Toolkit store, and an RTK Query API layer generated from
  `packages/contracts/openapi.json` — replacing the Phase 1 placeholder
  page.
- Login/logout against Phase 2's JWT endpoints, with unauthenticated
  users redirected away from protected routes.
- Mission list, mission detail, mission creation, and metadata-edit
  views wired to the existing mission CRUD/transition endpoints, with
  transition actions gated by the current state ([[Mission_State_Machine]])
  and the signed-in user's role (REQ-2.5's two flat roles).
- An upload workflow: request a signed URL, upload directly to MinIO,
  show progress, then trigger the DRAFT→QUEUED transition.
- Three new `apps/api` read paths this phase depends on: a
  `aidefense.detections` consumer that persists detections (reusing
  Phase 3's idempotent-consumption pattern, REQ-3.8) behind a REST
  endpoint; a REST endpoint over the existing `audit_log` table; and a
  signed-download-URL endpoint alongside the existing signed-upload-URL
  one.
- A NestJS WebSocket gateway that relays a mission's processing-events
  and detections to subscribed, authenticated clients, so the mission
  detail view updates live instead of polling.
- A video player with a canvas/SVG detection overlay, synced to frame
  timestamps, rendering the persisted detections against the mission's
  video.
- An event timeline (processing milestones, detections, audit entries)
  and basic filters/summary statistics per mission.
- One critical-path end-to-end test: create mission → upload → observe
  live status → see detections rendered.

## 4. Non-goals (explicitly out of scope for Phase 6)

- Any map rendering, geospatial layers, or telemetry visualization —
  that is Phase 7 (GIS and Telemetry), which the MVP plan notes
  "benefits from Phase 6's map container existing first" but does not
  require this phase to build it.
- Expanding RBAC beyond the existing two flat roles (`operator`,
  `admin`) — [[Security_Baseline]] and [[PRD-Phase-2]]'s open questions
  defer a `viewer`-only role or per-mission ownership checks until this
  phase surfaces a concrete product need; none is assumed by default.
- Full OIDC, session revocation, or token refresh — JWTs remain
  stateless per [[Security_Baseline]]; that hardening is Phase 10.
- Metrics dashboards, distributed tracing, or any Grafana/Prometheus UI
  — Phase 11. Structured logs and correlation IDs already exist and are
  sufficient for this phase's debugging needs.
- Edge/offline operation of the frontend — Phase 9 is about the edge
  *agent*, not a disconnected browser client; not addressed here.
- Any weapon guidance, target scoring, or autonomous engagement
  affordance in the UI, under any circumstance — the platform-wide
  safety boundary (`README.md`, roadmap Phase 5's safety constraint,
  [[Guiding_Principles]]) applies to the frontend exactly as it applies
  to the model.
- A full load/resilience/visual-regression test matrix — Phase 13. This
  phase ships exactly one critical-path end-to-end test, per the MVP
  plan's Phase 6 step 10.
- Re-encoding, transcoding, or proxying video bytes through `apps/api`
  — the player streams directly from MinIO via signed URLs, the same
  pattern REQ-2.9 already established for uploads.

## 5. Requirements

### 5.1 Backend read-path prerequisites

- REQ-6.1: `apps/api` gains a Kafka consumer for `aidefense.detections`
  that persists each `DETECTION_PUBLISHED` payload (bounding box,
  class, confidence, track ID, frame timestamp, mission ID) to a new
  Postgres table, reusing Phase 3's `processed_events`
  idempotent-consumption pattern (REQ-3.8) so duplicate delivery does
  not double-write.
- REQ-6.2: A `GET /missions/:id/detections` endpoint returns a
  mission's full persisted detection history, authenticated the same
  way `GET /missions/:id` already is (REQ-2.5).
- REQ-6.3: A `GET /missions/:id/audit-log` endpoint reads the existing
  `audit_log` table (REQ-2.10), filtered to the mission, ordered
  chronologically.
- REQ-6.4: `StorageService`/`StorageController` gains a signed
  *download* URL capability (mirroring REQ-2.9's upload URL), exposed
  per-mission for both the source video object key and Phase 5's
  `missions/{missionId}/annotated.mp4` artifact.
- REQ-6.5: A NestJS WebSocket gateway authenticates the connection
  handshake with the same JWT used for REST (REQ-2.4), lets a client
  subscribe to a specific mission ID, and relays that mission's
  `aidefense.processing-events` and `aidefense.detections` (via REQ-6.1's
  consumer) to subscribed clients only — never broadcasting one
  operator's mission data to a client not authorized to see it.

### 5.2 App scaffold and API layer

- REQ-6.6: `apps/web` is restructured with a routing library, a
  Material UI theme, a Redux Toolkit store, and an RTK Query API slice
  generated from `packages/contracts/openapi.json` (REQ-2.12) via
  `@rtk-query/codegen-openapi`, regenerated whenever the OpenAPI spec
  changes rather than hand-maintained.

### 5.3 Authentication

- REQ-6.7: A login screen calls the existing `/auth/login` endpoint;
  a route guard redirects unauthenticated users to it and blocks access
  to every mission-workspace route until a valid session exists.
- REQ-6.8: A logout action clears the client-side session state.

### 5.4 Mission list, detail, and lifecycle actions

- REQ-6.9: A mission list view lists all missions (`GET /missions`)
  with a status indicator reflecting [[Mission_State_Machine]]'s
  draft/queued/processing/completed/failed states.
- REQ-6.10: A mission detail view shows a single mission
  (`GET /missions/:id`); mission creation (`POST /missions`) and
  metadata edits (`PATCH /missions/:id`, DRAFT-only per REQ-2.7) are
  available from the workspace; state-transition actions
  (`POST /missions/:id/transition`) are shown only when legal for the
  mission's current state and the signed-in user's role.

### 5.5 Upload workflow

- REQ-6.11: The upload workflow requests a signed URL
  (`POST /missions/:id/upload-url`, REQ-2.9), uploads the file directly
  to MinIO with the returned URL, shows upload progress, and — once the
  upload completes — triggers the mission's DRAFT→QUEUED transition via
  the existing endpoint.

### 5.6 Real-time status and detections

- REQ-6.12: The mission detail view subscribes to REQ-6.5's WebSocket
  channel for the open mission while it is queued/processing, updating
  status and incoming detections live, without polling; it falls back
  to the REST reads (REQ-2.7's `GET`, REQ-6.2's detections) for the
  initial load and on reconnect after a dropped socket.

### 5.7 Video player and detection overlay

- REQ-6.13: A video player streams the mission's video from MinIO via
  REQ-6.4's signed download URL and renders a canvas/SVG overlay of
  REQ-6.2's persisted detections (bounding box, class label,
  confidence, track ID) synced to the current playback timestamp; the
  operator can also select Phase 5's pre-annotated
  `missions/{missionId}/annotated.mp4` artifact as an alternative to
  the live overlay.

### 5.8 Event timeline, filters, and audit view

- REQ-6.14: An event timeline component merges processing milestones
  (`PROCESSING_STARTED`/`PROCESSING_COMPLETED`/`PROCESSING_FAILED`),
  detection events, and REQ-6.3's audit-log entries into one
  chronological per-mission view.
- REQ-6.15: Basic filters and summary statistics are shown per mission
  — detections by class, mission duration, and the detection/track
  counts Phase 5 already computes (REQ-5.9's `PROCESSING_COMPLETED`
  fields).
- REQ-6.16: An audit-trail view lists REQ-6.3's per-mission audit
  entries (actor, action, timestamp), including the `null`-actor,
  system-triggered transitions Phase 3 introduced ([[Security_Baseline]]).

### 5.9 Testing

- REQ-6.17: Unit tests cover Redux slices/RTK Query hooks and the key
  presentational components (Vitest + Testing Library, per
  [[Web_Shell]]'s existing setup), plus unit tests for REQ-6.1's
  detections consumer and REQ-6.3/6.4's new endpoints on the
  `apps/api` side.
- REQ-6.18: One end-to-end test (Playwright or Cypress — see Section 11)
  covers the critical path named in the MVP plan: create mission →
  upload → observe live status → see detections rendered.

## 6. Technical approach (ordered task list)

1. Add REQ-6.1's `aidefense.detections` consumer and persistence table
   to `apps/api`, reusing the Phase 3 idempotent-consumption pattern.
2. Add REQ-6.2's detections-read endpoint and REQ-6.3's audit-log-read
   endpoint.
3. Add REQ-6.4's signed-download-URL capability to `StorageService`/
   `StorageController`.
4. Build REQ-6.5's WebSocket gateway: JWT-authenticated handshake,
   per-mission subscription, relaying processing-events and detections.
5. Restructure `apps/web`: routing, MUI theme, Redux store, and the
   RTK Query slice generated from `packages/contracts/openapi.json`
   (REQ-6.6).
6. Build login/logout and the protected-route guard (REQ-6.7/6.8).
7. Build the mission list, detail, create, edit, and transition views
   (REQ-6.9/6.10).
8. Build the upload workflow, including the post-upload transition
   trigger (REQ-6.11).
9. Wire the WebSocket client into the mission detail view for live
   status/detections, with REST fallback on load/reconnect (REQ-6.12).
10. Build the video player and detection overlay (REQ-6.13).
11. Build the event timeline, filters/statistics, and audit-trail view
    (REQ-6.14/6.15/6.16).
12. Write unit tests for both the new `apps/api` read paths and the
    frontend, plus the one end-to-end test (REQ-6.17/6.18).
13. Update [[Web_Shell]] and `docs/roadmap/Progress.md`.

## 7. ADRs required before/during Phase 6

No new ADR is required by [[MVP_Implementation_Plan]]'s ADR summary —
the frontend stack (React, TypeScript, Vite, Material UI, Redux
Toolkit, RTK Query) is already accepted in [[Technology_Decisions]] and
the roadmap's Phase 6 Technologies section.

One candidate is flagged, not required: REQ-6.5's WebSocket gateway is
a new inter-service communication pattern (`apps/api` has so far only
spoken REST and Kafka) — the transport/library choice (NestJS's default
`ws` adapter vs `socket.io` vs Server-Sent Events) and the
subscription/room model are a "significant architectural change" under
[[Coding_Standards]]'s ADR trigger only if the trade-offs turn out to
be non-obvious. Resolve during Section 6 step 4; write a short ADR
(next number `ADR-007`) only if that turns out to be warranted, the
same "pick the simpler one first" approach REQ-3.7 used for
polling vs LISTEN/NOTIFY.

Use `docs/adr/ADR-000-template.md` if one is written.

## 8. Success criteria / Definition of Done

- An operator can log in, create a mission, upload a video, and watch
  it move through queued → processing → completed entirely inside the
  React workspace, without calling the API directly — the MVP plan's
  stated Phase 6 exit criterion.
- Mission list/detail/create/edit/transition views work against the
  real `apps/api`, respecting [[Mission_State_Machine]] and RBAC.
- The mission detail view reflects `PROCESSING_STARTED`/
  `PROCESSING_COMPLETED`/`PROCESSING_FAILED` and incoming detections
  live via REQ-6.5's WebSocket gateway, not by polling.
- A completed mission's video plays with a detection overlay
  (bounding box, class, confidence, track ID) in sync with playback,
  sourced from REQ-6.1/6.2's persisted detections.
- The audit-trail view shows every mission-lifecycle and auth action
  recorded since Phase 2, including system-triggered (`null`-actor)
  transitions.
- Unit tests (REQ-6.17) and the one end-to-end test (REQ-6.18) pass
  locally and in CI, or are written and gated/skippable with a
  documented reason if a live Compose stack is unavailable in the
  environment they were authored in — the same pattern every prior
  phase's Known gaps have used for docker-dependent verification.
- `packages/contracts/openapi.json` remains the single source of truth
  for the RTK Query client — regenerating it after any `apps/api`
  change (including this phase's own REQ-6.2/6.3/6.4 additions) is part
  of this phase's own workflow, not a follow-up.

## 9. Dependencies

- Upstream: Phase 2's mission CRUD, auth, RBAC, signed upload URLs, and
  OpenAPI export (`packages/contracts/openapi.json`, explicitly staged
  "ready... once Phase 6 exists" per [[Progress]]); Phase 3's Kafka
  event platform, correlation IDs, and idempotent-consumption pattern
  (REQ-3.8, reused by REQ-6.1); Phase 5's `DETECTION_PUBLISHED` payload
  and annotated-video MinIO artifact.
- This phase adds new `apps/api` surface (a Kafka consumer, a Postgres
  table, three REST endpoints, one WebSocket gateway) that Phase 6's
  own frontend work depends on — it is not purely a frontend phase,
  see Section 2.
- Blocks: Phase 7 (GIS and Telemetry), whose map layer "benefits from
  Phase 6's map container existing first" per [[MVP_Implementation_Plan]],
  though Phase 7 does not strictly require Phase 6 to be complete.

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| Frontend drifts from the API if `packages/contracts/openapi.json` isn't regenerated after a backend change | Treat the spec as the single source of truth for RTK Query; regenerate as part of this phase's own new endpoints (REQ-6.2/6.3/6.4), not a follow-up |
| WebSocket gateway relays one operator's mission data to an unauthorized client | JWT-authenticated handshake, per-mission subscription scoped to the connecting user's authorization, mirroring REQ-2.5's existing RBAC checks (REQ-6.5) |
| Storing a bearer JWT in the browser increases XSS exposure | No third-party scripts introduced by this phase; resolve storage strategy (memory vs `sessionStorage`) as an explicit trade-off (Section 11), not a default; full session hardening remains Phase 10 |
| New detections consumer double-writes on duplicate Kafka delivery | Reuses REQ-3.8's `processed_events`-style idempotent-consumption pattern verbatim, not a new mechanism |
| No live Compose stack available to run the new consumer/gateway/e2e test end-to-end (recurring gap across Phases 2-5) | Gate integration/e2e tests behind env vars with `describe.skip`/documented reason, per every prior phase's Known gaps; verify on a normal dev machine |
| Scope creep into Phase 7's map/GIS work | Explicit non-goal (Section 4); Phase 7 boundary enforced |

(See also [[Initial_Risk_Register]] for platform-wide risks.)

## 11. Open questions

- JWT storage strategy in the browser — in-memory (Redux only, lost on
  refresh) vs `sessionStorage` (survives refresh, slightly larger XSS
  surface) — a UX/security trade-off to resolve during Section 6 step
  6, not before; revisit if Phase 10's OIDC work changes the token
  shape.
- WebSocket transport/library choice (NestJS's default `ws` adapter vs
  `socket.io` vs Server-Sent Events) — resolved during Section 6 step
  4; see Section 7 for when this would warrant its own ADR.
- End-to-end test tool — Playwright vs Cypress; the MVP plan names both
  as options without a stated preference. Resolve during Section 6
  step 12.
- Whether the video player defaults to the live detection overlay over
  the raw video or to Phase 5's pre-annotated MinIO artifact (or offers
  both, per REQ-6.13) — a UX decision, not a technical one.

---

## Relationship to other documents

- Derived from the "Phase 6 — Frontend Mission Workspace" section of
  [[MVP_Implementation_Plan]] and the roadmap's Phase 6 entry in
  [[AI_Defense_Platform_Roadmap]].
- Structure mirrors [[PRD-Phase-1]] through [[PRD-Phase-5]].
- Extends [[PRD-Phase-2]]'s mission/auth/storage surface and
  [[PRD-Phase-3]]'s event platform; renders [[PRD-Phase-5]]'s
  detections and annotated video for the first time in a UI.

---

## Related Notes

- [[MVP_Implementation_Plan]]
- [[AI_Defense_Platform_Roadmap]]
- [[PRD-Phase-2]]
- [[PRD-Phase-3]]
- [[PRD-Phase-5]]
- [[Web_Shell]]
- [[Security_Baseline]]
- [[Technology_Decisions]]
- [[Coding_Standards]]
- [[Mission_State_Machine]]
- [[Initial_Risk_Register]]
- [[Guiding_Principles]]
- [[ADR-000-template]]
