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

- [[Web_Shell]] — `apps/web` React+Vite scaffold.
- [[API_Shell]] — `apps/api` NestJS scaffold.
- [[Vision_Service_Shell]] — `apps/vision-service` FastAPI+uv scaffold.
- [[Local_Development_Stack]] — Docker Compose, CI, pre-commit hooks.
- [[Local_Kafka_Redpanda]] — the Phase 1 broker, ahead of Phase 3's topics.
- [[Phase1_Testing_Baseline]] — per-app test runners and what's covered.
- [[Observability_Baseline]] — structured logging, correlation IDs, health checks.
- [[Security_Baseline]] — secrets handling, what's still unauthenticated.

`docs/ai/`, `docs/c4/`, `docs/edge/` have no notes yet — Phase 1 doesn't
produce detection logic, C4 diagrams, or edge-runtime code, so there's
nothing grounded to document there until Phases 4/5/9.

## Governance — decisions and risk

- [[ADR-000-template]] — template for every Architecture Decision Record.
- [[ADR-001-monorepo-tooling]] — pnpm workspaces + Nx.
- [[ADR-002-python-dependency-manager]] — uv.
- [[ADR-003-kafka-distribution-local-compose]] — Redpanda for local Compose.
- [[Initial_Risk_Register]] — top platform-level risks and mitigations.

## Roadmap and planning — what happens when

- [[AI_Defense_Platform_Roadmap]] — the full 15-phase strategy.
- [[Sprint_0_Foundation]] — Sprint 0 backlog and Definition of Done (this
  is the sprint that produced everything in Foundation/Architecture/Governance above).
- [[MVP_Implementation_Plan]] — scopes and sequences Phases 1–7 into the MVP.
- [[PRD-Phase-1]] — Phase 1 expanded into full requirements (REQ-1.1–1.24).

---

## How to read the graph

- **Tags** group notes by domain: `#vision`, `#goals`, `#principles`,
  `#architecture`, `#quality-attributes`, `#technology`, `#repository`,
  `#standards`, `#risk`, `#adr`, `#roadmap`, `#sprint0`, `#mvp`, `#plan`,
  `#prd`, `#phase1`, `#moc`. Use Obsidian's tag pane to filter by any of
  these.
- **Related Notes** sections at the bottom of each note are the
  hand-curated edges of the graph; Obsidian's backlinks panel shows the
  reverse direction automatically.
- **Status** in each note's frontmatter (`accepted`, `draft`, `active`,
  `template`, `completed`) reflects where that document sits in its own
  lifecycle, independent of the roadmap phase it belongs to.

Every note title in this vault is unique, so every `[[wikilink]]` above
resolves unambiguously.
