---
title: Repository Structure
type: repository-structure
tags: [architecture, repository]
status: accepted
---

# Repository Structure

```text
ai-defense-platform/
├── README.md
├── docs/
│   ├── vision/
│   ├── roadmap/
│   ├── architecture/
│   ├── adr/
│   ├── c4/
│   ├── backend/
│   ├── frontend/
│   ├── python/
│   ├── ai/
│   ├── kafka/
│   ├── edge/
│   ├── devops/
│   ├── observability/
│   ├── security/
│   ├── testing/
│   └── decisions/
├── diagrams/
├── examples/
├── apps/
│   ├── web/
│   ├── api/
│   ├── vision-service/
│   ├── outbox-publisher/
│   └── edge-agent/
├── packages/
│   ├── contracts/
│   ├── event-schemas/
│   ├── ts-config/
│   ├── eslint-config/
│   └── observability/
├── infrastructure/
│   ├── compose/
│   ├── kafka/
│   ├── postgres/
│   ├── minio/
│   ├── kubernetes/
│   └── observability/
├── datasets/
├── models/
├── samples/
└── scripts/
```

## Rules

- `apps/` contains deployable applications.
- `packages/` contains reusable libraries and contracts.
- `docs/` is the Architecture Knowledge Base.
- `examples/` contains minimal safe examples.
- datasets and model binaries are not committed unless explicitly licensed and small.
- architecture decisions live in `docs/adr/`.
- generated diagrams should have source files committed.

---

## Related Notes

- [[Architecture_Overview]] — containers mapped to these folders.
- [[Coding_Standards]] — conventions followed within this structure.
- [[PRD-Phase-1]] — Phase 1 scaffolds this exact layout.
