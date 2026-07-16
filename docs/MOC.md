---
title: AI Defense Platform — Map of Content
type: moc
tags: [moc]
status: active
---

# AI Defense Platform — Map of Content

This is the entry point into the Architecture Knowledge Base. Open this
note in Obsidian and use the graph view or the links below to navigate;
every note links back to the notes it depends on and forward to the
notes that build on it.

---

## Foundation — why the platform exists

- [[Vision]] — long-term direction and product philosophy.
- [[Goals]] — functional/non-functional goals and MVP scope.
- [[Guiding_Principles]] — the 16 principles behind every trade-off.

## Architecture — how it's built

- [[Quality_Attributes]] — prioritized trade-offs (security first).
- [[Architecture_Overview]] — containers, primary flow, consistency model.
- [[Technology_Decisions]] — rationale for React, NestJS, Kafka, YOLO, etc.
- [[Repository_Structure]] — folder layout and ownership rules.
- [[Coding_Standards]] — TypeScript/Python/event conventions, ADR trigger.

## Contributing — how to work on this repo

- [[CONTRIBUTING]] — branch/release strategy, Conventional Commits,
  pre-commit hooks, PR checklist.

## Implementation notes — what Phase 1 actually built

- [[Mission_State_Machine]] — Phase 2's mission lifecycle (draft → queued → processing → completed/failed).
- [[Web_Shell]] — `apps/web`, from the Phase 1 React+Vite scaffold to Phase 6's real Mission Workspace (auth, missions, upload, real-time, video overlay) to Phase 7's map container (telemetry route, detection markers, video-scrub sync).
- [[API_Shell]] — `apps/api` NestJS scaffold.
- [[Vision_Service_Shell]] — `apps/vision-service` FastAPI+uv scaffold.
- [[Local_Development_Stack]] — Docker Compose, CI, pre-commit hooks.
- [[Local_Kafka_Redpanda]] — the Phase 1 broker, ahead of Phase 3's topics.
- [[Phase1_Testing_Baseline]] — per-app test runners and what's covered.
- [[Observability_Baseline]] — structured logging, correlation IDs, health checks.
- [[Security_Baseline]] — secrets handling, what's still unauthenticated.
- [[Detection_And_Tracking]] — Phase 5's detect/filter/track/publish pipeline and safety boundary.

- [[Edge_Runtime]] — Phase 9's `apps/edge-agent` implementation: local inference sidecar, offline buffer, store-and-forward sync, device identity, model resolution.

`docs/c4/` still has no notes — nothing grounded to document there yet
(C4 diagrams). `docs/ai/` has [[Detection_And_Tracking]] since Phase 5;
`docs/edge/` now has [[Edge_Runtime]], its first note, since Phase 9.

## Governance — decisions and risk

- [[ADR-000-template]] — template for every Architecture Decision Record.
- [[ADR-001-monorepo-tooling]] — pnpm workspaces + Nx.
- [[ADR-002-python-dependency-manager]] — uv.
- [[ADR-003-kafka-distribution-local-compose]] — Redpanda for local Compose.
- [[ADR-004-nestjs-orm]] — Prisma for `apps/api`'s ORM (Phase 2, proposed).
- [[ADR-005-event-schema-versioning]] — additive-only, per-eventType versioning for Kafka events (Phase 3, accepted).
- [[ADR-006-detection-model-and-tracker]] — YOLOv8n/ONNX Runtime model choice, detector adapter interface, and in-house tracker (Phase 5, accepted).
- [[ADR-007-map-library-choice]] — MapLibre GL JS + token-free OSM raster tiles (Phase 7, accepted).
- [[ADR-008-experiment-tracking-and-dataset-versioning]] — in-house Postgres/MinIO experiment tracking and dataset versioning over MLflow/DVC (Phase 8, accepted).
- [[ADR-009-annotation-format]] — COCO JSON as the annotation interchange format (Phase 8, accepted).
- [[ADR-010-edge-runtime-language-and-inference-strategy]] — Node orchestrator + Python detection sidecar over stdio (Phase 9, accepted).
- [[ADR-011-device-identity-and-sync-transport]] — device bearer-token identity and HTTP sync transport (Phase 9, accepted).
- [[Initial_Risk_Register]] — top platform-level risks and mitigations.

## Roadmap and planning — what happens when

- [[Progress]] — live checklist of what's done, updated per completed task.
- [[AI_Defense_Platform_Roadmap]] — the full 15-phase strategy.
- [[Sprint_0_Foundation]] — Sprint 0 backlog and Definition of Done (this
  is the sprint that produced everything in Foundation/Architecture/Governance above).
- [[MVP_Implementation_Plan]] — scopes and sequences Phases 1–7 into the MVP.
- [[PRD-Phase-1]] — Phase 1 expanded into full requirements (REQ-1.1–1.24).
- [[PRD-Phase-2]] — Phase 2 expanded into full requirements (REQ-2.1–2.14).
- [[PRD-Phase-3]] — Phase 3 expanded into full requirements (REQ-3.1–3.15).
- [[PRD-Phase-4]] — Phase 4 expanded into full requirements (REQ-4.1–4.12).
- [[PRD-Phase-5]] — Phase 5 expanded into full requirements (REQ-5.1–5.12).
- [[PRD-Phase-6]] — Phase 6 expanded into full requirements (REQ-6.1–6.18).
- [[PRD-Phase-7]] — Phase 7 (MVP slice) expanded into full requirements (REQ-7.1–7.9).
- [[PRD-Phase-8]] — Phase 8 (post-MVP, full roadmap scope) expanded into full requirements (REQ-8.1–8.17).
- [[PRD-Phase-9]] — Phase 9 (post-MVP, full roadmap scope) expanded into full requirements (REQ-9.1–9.18); implemented on ADR-010/ADR-011.
- [[PRD-Phase-10]] — Phase 10 (post-MVP, full roadmap scope) expanded into full requirements (REQ-10.1–10.18); flags ADR-012–ADR-015 (secrets management, OIDC/RBAC-ABAC, mTLS strategy, supply-chain tooling), not yet drafted — planning only, implementation not started.

---

## How to read the graph

- **Tags** group notes by domain: `#vision`, `#goals`, `#principles`,
  `#architecture`, `#quality-attributes`, `#technology`, `#repository`,
  `#standards`, `#risk`, `#adr`, `#roadmap`, `#sprint0`, `#mvp`, `#plan`,
  `#prd`, `#phase1`, `#phase4`, `#phase5`, `#phase6`, `#phase7`, `#phase8`,
  `#phase9`, `#phase10`, `#mlops`, `#ai`, `#edge`, `#moc`. Use Obsidian's tag pane to
  filter by any of these.
- **Related Notes** sections at the bottom of each note are the
  hand-curated edges of the graph; Obsidian's backlinks panel shows the
  reverse direction automatically.
- **Status** in each note's frontmatter (`accepted`, `draft`, `active`,
  `template`, `completed`) reflects where that document sits in its own
  lifecycle, independent of the roadmap phase it belongs to.

Every note title in this vault is unique, so every `[[wikilink]]` above
resolves unambiguously.
