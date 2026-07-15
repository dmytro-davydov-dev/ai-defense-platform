---
title: "PRD — Phase 7: GIS and Telemetry (MVP Slice)"
type: prd
tags: [mvp, prd, phase7]
status: draft
---

# PRD — Phase 7: GIS and Telemetry (MVP Slice)

Version: 1.0
Status: Draft
Date: 2026-07-15
Owner: Dmytro
Related documents: [[MVP_Implementation_Plan]], [[AI_Defense_Platform_Roadmap]], [[PRD-Phase-2]], [[PRD-Phase-5]], [[PRD-Phase-6]], [[Web_Shell]], [[Technology_Decisions]], [[Architecture_Overview]], [[Security_Baseline]], [[Coding_Standards]], [[Mission_State_Machine]], [[Initial_Risk_Register]], [[Guiding_Principles]], [[Goals]]

---

## 1. Summary

Phase 7 adds the roadmap's named MVP goal "geospatial visualization" on
top of Phase 6's Mission Workspace. It is explicitly the **MVP slice**
of the roadmap's full Phase 7 scope
([[AI_Defense_Platform_Roadmap]] — "GIS and Telemetry Platform"), per
[[MVP_Implementation_Plan]]'s own "Phase 7 — GIS and Telemetry (MVP
slice)" section: batch telemetry ingestion, PostGIS storage, a map
container in `apps/web` rendering a mission's route and (approximate)
detection positions, and basic video/map timeline sync. Geofences, full
spatial queries, uncertainty-radius indicators, and multi-mission
overlay are the full roadmap Phase 7 scope and are explicitly deferred
past the MVP.

## 2. Problem statement

Today, `apps/api`'s Postgres database has no geospatial data at all —
[[Architecture_Overview]] lists "geospatial data" as one of
PostgreSQL/PostGIS's responsibilities, but no table uses it yet
(`apps/api/prisma/schema.prisma` has no geometry column). There is no
way to ingest a mission's telemetry (GPS track, waypoints) at all, no
endpoint to read it back, and `apps/web` has no map component —
[[Web_Shell]] states plainly: "No map/GIS rendering — Phase 7." A
mission's detections (Phase 5/6) exist only as frame-relative bounding
boxes on a video; nothing correlates a detection's frame timestamp to a
real-world position.

Two of the MVP's named goals — "geospatial visualization" and
"[synchronize] video, detections and telemetry timelines" (Goals.md) —
cannot be demonstrated until this gap closes. Phase 7 must add: (a) a
place to store telemetry as real geospatial data, (b) a way to get
telemetry into the system without a live sensor feed (batch upload
only, per the MVP plan), and (c) a map in the browser that renders a
mission's route, plots detections at their best-available approximate
position, and stays roughly in sync with video playback.

## 3. Goals

- PostGIS-backed telemetry storage: a new Postgres table holding
  ordered, timestamped geospatial points per mission, added via a
  raw-SQL migration (Prisma has no native PostGIS geometry type — same
  `$queryRaw`/`$executeRaw` pattern already used for
  `OutboxRepository`/`ProcessedEventsRepository`/`DetectionsRepository`).
- A telemetry ingestion endpoint accepting a CSV or GeoJSON upload per
  mission — no live sensor feed in the MVP, per
  [[MVP_Implementation_Plan]].
- A read endpoint returning a mission's telemetry as GeoJSON, ready to
  feed a map library directly.
- A MapLibre GL JS map container in `apps/web` (chosen over Mapbox GL JS
  specifically to avoid a mandatory paid token dependency for a
  reference/portfolio implementation, per
  [[MVP_Implementation_Plan]] — to be confirmed by a short ADR, Section 7).
- The mission route rendered as a line layer, and each persisted
  detection (Phase 5/6) plotted at the nearest-in-time telemetry point
  — a nearest-neighbor approximation, not interpolation.
- Basic video/map timeline sync: as the operator scrubs the video, a
  marker on the map moves to the nearest-in-time telemetry point.
- Every rendered geolocation (route, detection markers, current-position
  marker) is visibly labeled as approximate/estimated, satisfying the
  roadmap's Phase 7 safety constraint at the UI layer, not just in a
  document.

## 4. Non-goals (explicitly out of scope for Phase 7 MVP slice)

- Geofences (definition, evaluation, or alerting) — full roadmap
  Phase 7 scope, deferred post-MVP.
- Full spatial queries (e.g. "missions within this bounding box/radius",
  `ST_Within`/`ST_DWithin`-backed search) — deferred post-MVP; this
  phase only ever queries telemetry by mission ID.
- Uncertainty-radius indicators or any confidence visualization beyond
  the flat "approximate" label — deferred post-MVP.
- Multi-mission map overlay (viewing more than one mission's route at
  once) — deferred post-MVP; the map container is per-mission only.
- True interpolation-based replay (estimating position *between*
  telemetry samples by time-weighted interpolation) — the MVP slice
  uses nearest-neighbor matching only, per
  [[MVP_Implementation_Plan]]'s "basic timeline sync, not full
  interpolation-based replay."
- A live telemetry feed from a real or simulated sensor — batch
  upload (CSV/GeoJSON) only; live device telemetry is Phase 9's edge
  runtime concern.
- Mapbox GL JS, or any paid/token-gated map tile provider, as the
  default — resolved by this phase's ADR (Section 7); revisit only if a
  concrete product need emerges.
- Any weapon guidance, targeting, or strike-relevant use of geospatial
  data, under any circumstance — the platform-wide safety boundary
  (`README.md`, roadmap Phase 7's own constraint,
  [[Guiding_Principles]]) applies to this phase exactly as it applies to
  detection and tracking.
- A full load/resilience/visual-regression test matrix — Phase 13. This
  phase extends the existing Phase 6 critical-path end-to-end test
  rather than adding a new heavy suite.
- Re-encoding, transcoding, or generating video from telemetry — out of
  scope; telemetry only augments the existing Phase 6 video player.

## 5. Requirements

### 5.1 Data model and telemetry ingestion

- REQ-7.1: A new Postgres table stores ordered, timestamped telemetry
  points per mission (latitude/longitude as a PostGIS `geography(Point,
  4326)` column, plus timestamp and optional altitude/heading/speed),
  added via a hand-written raw-SQL migration — Prisma has no native
  PostGIS geometry type, so reads/writes go through `$queryRaw`/
  `$executeRaw`, the same pattern already established by
  `OutboxRepository`/`ProcessedEventsRepository`/`DetectionsRepository`.
- REQ-7.2: A `POST /missions/:id/telemetry` endpoint accepts a CSV or
  GeoJSON file upload, parses it into ordered telemetry points, rejects
  malformed rows/out-of-order timestamps with a clear validation error,
  and persists the result — authenticated and RBAC-gated the same way
  every other mutating mission endpoint is (REQ-2.5). No live sensor
  feed; batch upload only, per the MVP plan.
- REQ-7.3: A `GET /missions/:id/telemetry` endpoint returns a mission's
  persisted telemetry as a GeoJSON `LineString` (plus per-point
  timestamps), authenticated the same way `GET /missions/:id/detections`
  already is (REQ-6.2), ready to feed a map library directly with no
  frontend-side reshaping.

### 5.2 Map integration

- REQ-7.4: MapLibre GL JS is integrated into `apps/web` as a new
  dependency, with a base map/tile source that requires no mandatory
  paid API token — the choice is confirmed by this phase's ADR
  (Section 7).
- REQ-7.5: A map container renders a mission's route (REQ-7.3's
  `LineString`) as a line layer, and plots each of the mission's
  persisted detections (REQ-6.2) as a point marker at its nearest-in-time
  telemetry point (nearest-neighbor match on timestamp, not
  interpolated) — every marker visibly labeled as an approximate
  position, per the roadmap's Phase 7 constraint.
- REQ-7.6: The map container is wired into the existing Phase 6 video
  player (`VideoPlayerWithOverlay`): as the operator scrubs playback, a
  current-position marker moves to the telemetry point nearest the
  current playback timestamp — a basic timeline sync, not full
  interpolation-based replay.
- REQ-7.7: Every rendered geolocation (route, detection markers,
  current-position marker) carries a persistent, visible "approximate/
  estimated" label or legend entry in the UI — this platform must never
  present estimated coordinates as verified targeting data, per the
  roadmap's explicit Phase 7 constraint and the platform-wide safety
  boundary.

### 5.3 Testing

- REQ-7.8: Unit tests cover the CSV/GeoJSON telemetry parser (valid
  input, malformed rows, out-of-order timestamps) and the
  nearest-in-time matching utility (detection-to-telemetry-point,
  playback-timestamp-to-telemetry-point), plus the two new `apps/api`
  endpoints (REQ-7.2/7.3).
- REQ-7.9: The existing Phase 6 end-to-end test
  (`e2e/mission-workflow.spec.ts`) is extended, not duplicated, to cover
  uploading a telemetry file and asserting the map container renders a
  route — following the same env-gated/skippable pattern every prior
  phase's Known gaps have used when a live Compose stack isn't
  available in the environment the test was authored in.

## 6. Technical approach (ordered task list)

1. Resolve the map library choice via a short ADR (Section 7) before
   writing any frontend map code.
2. Write the raw-SQL migration adding the telemetry table with a
   PostGIS `geography(Point, 4326)` column (REQ-7.1).
3. Implement a `TelemetryRepository` (`$queryRaw`/`$executeRaw`, mirroring
   `DetectionsRepository`'s pattern) and the CSV/GeoJSON parsing/
   validation logic shared by REQ-7.2.
4. Add `POST /missions/:id/telemetry` and `GET /missions/:id/telemetry`
   to `MissionsController` (REQ-7.2/7.3).
5. Add MapLibre GL JS to `apps/web` and build the map container
   component (REQ-7.4/7.5).
6. Implement the nearest-in-time matching utility (shared by detection
   plotting and video-scrub sync) and wire the map into
   `VideoPlayerWithOverlay` (REQ-7.6).
7. Add the "approximate/estimated" labeling — a persistent legend or
   badge, not a one-time tooltip — to every geolocation element
   (REQ-7.7).
8. Write unit tests for the parser, matching utility, and new endpoints
   (REQ-7.8); extend the Phase 6 e2e test (REQ-7.9).
9. Update [[Web_Shell]], [[Architecture_Overview]] (if the telemetry
   table changes the PostGIS section's status from aspirational to
   real), and `docs/roadmap/Progress.md`.

## 7. ADRs required before/during Phase 7

- **Map library choice (MapLibre GL JS vs Mapbox GL JS)** — next ADR
  number `ADR-007`. This is the seventh and last ADR named in
  [[MVP_Implementation_Plan]]'s "Summary: ADRs Required Before/During
  MVP" list and has not yet been drafted. [[MVP_Implementation_Plan]]'s
  Phase 7 next-steps already reasons through the trade-off (MapLibre
  avoids a mandatory paid-token dependency for a reference/portfolio
  implementation) — this ADR formalizes that reasoning per
  [[Coding_Standards]]'s "significant architectural change" trigger,
  since it is this phase's first new external service dependency
  (tile/basemap source). Use [[ADR-000-template]]. Write before Section
  6 step 5.

## 8. Success criteria / Definition of Done

- An operator can upload a CSV or GeoJSON telemetry file for a mission
  and see its route rendered as a line on a map inside the React
  workspace, without calling the API directly.
- Detections persisted since Phase 6 appear as point markers on the map
  at their nearest-in-time telemetry position.
- Scrubbing the mission's video moves a current-position marker on the
  map to the nearest-in-time telemetry point — a basic, not
  interpolated, sync.
- Every geolocation element on the map is visibly labeled as
  approximate/estimated — verified by REQ-7.9's e2e assertion, not just
  documentation.
- Unit tests (REQ-7.8) and the extended end-to-end test (REQ-7.9) pass
  locally and in CI, or are written and gated/skippable with a
  documented reason if a live Compose stack is unavailable in the
  environment they were authored in — the same pattern every prior
  phase's Known gaps have used for docker-dependent verification.
- `ADR-007` (map library choice) is accepted before any map-rendering
  code is merged.

## 9. Dependencies

- Upstream: Phase 2's mission data and RBAC model (telemetry endpoints
  reuse REQ-2.5's auth pattern); Phase 5/6's persisted detections
  (REQ-6.1/6.2, the data this phase plots on the map); Phase 6's video
  player (`VideoPlayerWithOverlay`, which this phase wires a map into
  for scrub sync) — note that Phase 6 explicitly did **not** build a
  map container ([[Web_Shell]]: "No map/GIS rendering — Phase 7"),
  so this phase starts that component from scratch rather than
  extending an existing one, despite [[MVP_Implementation_Plan]]'s
  framing that Phase 7 "benefits from Phase 6's map container existing
  first."
- This phase adds new `apps/api` surface (a raw-SQL-backed telemetry
  table, two REST endpoints) before any frontend map work can start —
  same backend-then-frontend shape as Phase 6.
- Blocks: nothing in the MVP — Phase 7 (MVP slice) is the last phase
  [[MVP_Implementation_Plan]] scopes; Phases 8+ are explicitly deferred
  past the MVP and do not depend on this phase's specific
  implementation choices.

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| Prisma has no native PostGIS geometry type, so telemetry reads/writes bypass the generated client entirely | Reuse the already-established `$queryRaw`/`$executeRaw` pattern (`OutboxRepository`/`ProcessedEventsRepository`/`DetectionsRepository`) rather than inventing a new one |
| Nearest-neighbor detection/scrub-to-telemetry matching misleads an operator into treating an approximate position as precise | REQ-7.7 makes the "approximate/estimated" label a testable requirement (REQ-7.9), not just a doc note |
| Malformed or out-of-order CSV/GeoJSON telemetry uploads corrupt a mission's route | REQ-7.2 validates and rejects malformed input with a clear error before persisting anything |
| MapLibre's default demo tile/style source may require internet access, conflicting with the platform's local-first, `docker compose up`-only design goal | Resolve the base-map/tile-source choice explicitly as part of ADR-007, not as an afterthought (see Open questions) |
| Scope creep into the roadmap's full Phase 7 scope (geofences, spatial queries, uncertainty indicators, multi-mission overlay) | Explicit non-goals (Section 4); full scope stays on the roadmap, past the MVP |
| No live Compose stack available to run the new endpoints/e2e assertions end-to-end (recurring gap across Phases 2–6) | Gate integration/e2e tests behind env vars with `describe.skip`/documented reason, per every prior phase's Known gaps; verify on a normal dev machine |

(See also [[Initial_Risk_Register]] for platform-wide risks.)

## 11. Open questions

- CSV vs GeoJSON as the primary telemetry upload format — the MVP plan
  names both as options without a stated preference. Recommend
  supporting both with a well-defined CSV column schema
  (`timestamp,lat,lon[,altitude,heading,speed]`), resolved during
  Section 6 step 3.
- Base-map/tile source for MapLibre in a fully local, offline-capable
  Compose environment — a hosted free-tier vector tile source is
  simplest but reintroduces an internet dependency the rest of the
  stack doesn't have; resolve as part of ADR-007 (Section 7), including
  whether an offline/raster fallback is worth the added complexity for
  this phase or can be deferred.
- Where the map container lives in the mission detail view — a new
  panel/tab alongside the video player, or a split view — a UX
  decision, not a technical one, to resolve during Section 6 step 5.
- Whether `Architecture_Overview.md`'s PostGIS section needs updating
  once this phase makes "geospatial data" a real, not aspirational,
  responsibility of the PostgreSQL/PostGIS container.

---

## Relationship to other documents

- Derived from the "Phase 7 — GIS and Telemetry (MVP slice)" section of
  [[MVP_Implementation_Plan]] and the roadmap's fuller "Phase 7 — GIS
  and Telemetry Platform" entry in [[AI_Defense_Platform_Roadmap]],
  whose geofence/spatial-query/uncertainty-indicator/multi-mission
  scope this PRD explicitly defers past the MVP.
- Structure mirrors [[PRD-Phase-1]] through [[PRD-Phase-6]].
- Extends [[PRD-Phase-2]]'s mission data/RBAC surface, and renders
  [[PRD-Phase-5]]/[[PRD-Phase-6]]'s persisted detections and video
  player for the first time on a map.

---

## Related Notes

- [[MVP_Implementation_Plan]]
- [[AI_Defense_Platform_Roadmap]]
- [[PRD-Phase-2]]
- [[PRD-Phase-5]]
- [[PRD-Phase-6]]
- [[Web_Shell]]
- [[Technology_Decisions]]
- [[Architecture_Overview]]
- [[Security_Baseline]]
- [[Coding_Standards]]
- [[Mission_State_Machine]]
- [[Initial_Risk_Register]]
- [[Guiding_Principles]]
- [[Goals]]
- [[ADR-000-template]]
