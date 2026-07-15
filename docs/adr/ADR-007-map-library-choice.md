---
title: "ADR-007: Map Library Choice"
type: adr
tags: [adr, phase7]
status: accepted
---

# ADR-007: Map Library Choice

- Status: Accepted
- Date: 2026-07-15
- Decision owners: Dmytro
- Related documents: [[PRD-Phase-7]], [[MVP_Implementation_Plan]], [[AI_Defense_Platform_Roadmap]], [[Technology_Decisions]], [[Coding_Standards]], [[Web_Shell]], [[Architecture_Overview]]

## Context

`docs/mvp-plan/PRD-Phase-7.md` Section 7 requires this ADR to settle
the map library choice before any frontend map code is written — the
seventh and last ADR named in [[MVP_Implementation_Plan]]'s "Summary:
ADRs Required Before/During MVP" list. This is `apps/web`'s first new
external service dependency (a map tile/basemap source), which makes
it a "significant architectural change" under [[Coding_Standards]]'s
ADR trigger even though [[Technology_Decisions]] doesn't yet name a
specific map library.

Two additional constraints shape the decision, beyond just "which
library":

- **No mandatory paid token.** This is a reference/portfolio
  implementation ([[AI_Defense_Platform_Roadmap]]'s Vision section);
  requiring a paid API key just to see a basemap would break the
  `docker compose up`-and-go experience every prior phase has kept
  (REQ-1.17).
- **Local-first tension.** The rest of the stack runs fully offline
  once images are pulled (Postgres, Kafka/Redpanda, MinIO all run in
  Compose with no external calls). A map basemap is the first
  component that, by its nature, usually wants to fetch tile images
  from a remote server. This ADR does not pretend to solve that
  fully — it makes the trade-off explicit instead of silent.

## Decision

**MapLibre GL JS**, integrated directly (no `react-map-gl` wrapper —
consistent with this codebase's existing style of hand-rolling small
integrations rather than adding a wrapper library, e.g. the canvas
detection overlay in `VideoPlayerWithOverlay.tsx` uses the raw
`<canvas>` API rather than a charting library).

**Basemap/tile source**: OpenStreetMap's public raster tile servers
(`https://tile.openstreetmap.org/{z}/{x}/{y}.png`), referenced from a
minimal inline MapLibre "raster" style object — no vector style, no
API key, no third-party map-provider account. This requires outbound
internet access to actually render tile *images*; it does not require
any account, token, or paid tier. The route line, detection markers,
and current-position marker (REQ-7.5–7.7) all render as MapLibre
GeoJSON/marker layers on top of this raster base and work identically
regardless of whether the tile images themselves load — the map is
still usable (as a blank/gray canvas with the route and markers
visible) with no internet access at all, since MapLibre GL JS itself
has no phone-home behavior beyond the tile URLs it's explicitly given.

Full offline tile support (bundling a raster/vector tileset into the
repo or Compose stack) is **not** attempted in this phase — it would
add real complexity (tile generation/storage, a tile-server container)
for a reference implementation where an internet-connected dev machine
is the normal case. Flagged as a candidate follow-up only if a fully
air-gapped demo environment becomes a real requirement.

## Alternatives considered

### Alternative A — MapLibre GL JS as decided

Open-source, BSD-2-Clause-licensed fork of Mapbox GL JS v1 (pre-license
change), API-compatible with the code patterns most map tutorials and
this ADR's own reasoning describe, no account or token required for
either the library or a public raster tile source. Chosen.

### Alternative B — Mapbox GL JS

Named as an option in the roadmap's Phase 7 Technologies list
alongside MapLibre. Rejected for this reference implementation: Mapbox
GL JS v2+ requires a Mapbox account and access token even for
self-hosted use (a 2020 licensing change, the reason MapLibre exists as
a fork in the first place), which would gate the entire map feature
behind a signup step that has nothing to do with this platform's own
architecture — exactly the friction [[MVP_Implementation_Plan]]'s
Phase 7 next-steps already flagged as the reason to prefer MapLibre.

### Alternative C — a lighter 2D canvas/SVG-only map (no tile basemap at all)

Would sidestep the local-first tension entirely (no tile fetch, ever)
by drawing the route/markers on a bare coordinate grid with no
real-world basemap context. Rejected: a mission's route without any
geographic context (coastline, roads, terrain) undermines the actual
product goal ("geospatial visualization" — [[Goals]]) — an operator
needs to see *where* a route is, not just its shape. Revisit only if
the offline-tile-bundling follow-up above becomes a real requirement
and a lightweight vector basemap can be bundled instead.

### Alternative D — a hosted vector tile provider requiring a free-tier API key (e.g. MapTiler, Stadia Maps)

Free tiers exist and would give a nicer vector basemap than raster OSM
tiles. Rejected for the same reason as Alternative B: any account/key
requirement, even a free one, adds a signup step between cloning this
repository and seeing a working demo. OpenStreetMap's raster tiles
require no key at all. Revisit if raster tile styling proves visually
insufficient.

## Consequences

### Positive

- No API key, account, or paid tier anywhere in the map feature —
  `docker compose up` remains the only setup step, consistent with
  every prior phase.
- MapLibre GL JS's GeoJSON source/layer API accepts REQ-7.3's
  `GET /missions/:id/telemetry` response with no server-side
  reshaping — the route line layer is a direct `LineString` source.
- Swapping the tile source later (e.g. to a bundled offline tileset) is
  isolated to the one style-object definition; no application code
  depends on which tile server is configured.

### Negative

- Rendering an actual basemap requires outbound internet access to
  `tile.openstreetmap.org` — a real, documented gap against this
  platform's otherwise fully local Compose stack. The map's own data
  layers (route, markers) do not depend on this and remain visible
  without it.
- OpenStreetMap's public tile servers have a documented, informal
  usage policy (no heavy automated/bulk use) that is fine for a
  reference/demo deployment but would need reconsidering (e.g. a paid
  tile provider or self-hosted tile server) before any real production
  or high-traffic use — out of scope for this phase.

### Risks

- If a future environment this platform is demoed in has no outbound
  internet access at all, the basemap will not render — mitigated by
  the map's data layers remaining functional and by documenting this
  explicitly rather than discovering it silently (see
  [[Initial_Risk_Register]] for the platform-wide pattern of documenting
  rather than hiding sandbox/environment limitations).

## Migration and rollback

No migration — this is new, additive frontend functionality. Rollback
is removing the `maplibre-gl` dependency and the map container
component; no other feature depends on it.

## Review date

Revisit if: OpenStreetMap's tile usage policy becomes a real constraint
for a demo/production deployment; a fully air-gapped demo environment
becomes a requirement; or the roadmap's full Phase 7 scope (geofences,
spatial queries) needs a richer basemap/vector-tile capability than a
raster source provides.

---

## Related Notes

- [[PRD-Phase-7]] — the requirement (Section 7) this ADR resolves.
- [[Technology_Decisions]] — where this decision is now also referenced.
- [[Coding_Standards]] — the ADR trigger this decision follows.
- [[Web_Shell]] — the `apps/web` component this ADR's decision is built into.
- [[Architecture_Overview]] — the React Workspace container this map feature extends.
- [[Initial_Risk_Register]] — the environment-limitation-documentation pattern this ADR follows.
