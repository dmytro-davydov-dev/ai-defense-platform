---
title: Coding Standards
type: standards
tags: [architecture, standards]
status: accepted
---

# Coding Standards

## General

- English for code, APIs, schemas and commit messages.
- Ukrainian or English may be used in explanatory documentation.
- Small, reviewable pull requests.
- Conventional Commits (recommended style; no longer machine-enforced —
  commitlint was disabled 2026-07-14, see [[Progress]] Known gaps).
- No secrets or sensitive data in the repository.
- Every externally visible contract is versioned.

## TypeScript

- strict TypeScript;
- avoid `any`;
- explicit DTO validation;
- dependency inversion for infrastructure adapters;
- domain logic separated from controllers;
- exhaustive handling of status unions;
- ESLint and Prettier;
- Jest/Vitest depending on package;
- integration tests for persistence and Kafka adapters.

## NestJS

- modules aligned with bounded contexts;
- controllers remain thin;
- application services orchestrate use cases;
- repositories hide persistence details;
- Kafka handlers are idempotent;
- correlation context is propagated;
- errors use stable machine-readable codes.

## Python

- Python 3.12+;
- type hints for public functions;
- `pyproject.toml`;
- Ruff;
- formatter;
- pytest;
- Pydantic at API and event boundaries;
- NumPy array shapes documented;
- OpenCV/YOLO isolated behind adapters;
- no unbounded frame accumulation;
- deterministic test fixtures where possible.

## Events

Every event includes:

```json
{
  "eventId": "uuid",
  "eventType": "MISSION_PROCESSING_REQUESTED",
  "eventVersion": 1,
  "occurredAt": "RFC3339 timestamp",
  "correlationId": "uuid",
  "causationId": "uuid or null",
  "producer": "service-name",
  "payload": {}
}
```

## Testing expectations

- domain logic: unit tests;
- adapters: integration tests;
- event contracts: schema tests;
- critical flows: end-to-end tests;
- model behavior: evaluation fixtures and threshold-based checks.

## Documentation expectations

A significant architectural change requires:

- updated documentation;
- an ADR;
- updated diagrams when relevant;
- migration and rollback notes.

---

## Related Notes

- [[Repository_Structure]] — where this code lives.
- [[ADR-000-template]] — template for the ADRs this document requires.
- [[Guiding_Principles]] — principles these standards operationalize.
- [[PRD-Phase-1]] — first phase these standards are enforced from.
