---
title: "ADR-005: Event schema versioning and compatibility policy"
type: adr
tags: [adr, kafka, events, phase3]
status: accepted
---

# ADR-005: Event schema versioning and compatibility policy

- Status: Accepted
- Date: 2026-07-14
- Decision owners: Dmytro
- Related documents: [[PRD-Phase-3]], [[Coding_Standards]], [[Local_Kafka_Redpanda]], [[ADR-003-kafka-distribution-local-compose]]

## Context

Phase 3 gives `packages/event-schemas` real content for the first time:
the event envelope and per-topic payload schemas that `apps/api`,
`apps/outbox-publisher`, and `apps/vision-service` all produce/consume
against. `ADR-003` deliberately deferred a Schema Registry — there is no
runtime component rejecting incompatible messages — so compatibility has
to be enforced by convention plus CI, or it doesn't get enforced at all.
`Coding_Standards.md`'s envelope shape already fixes `eventVersion` as a
field on every event; this ADR defines what changing that number means
and what a producer/consumer is allowed to assume.

This decision is required before REQ-3.3/3.4 (the envelope JSON Schema
and generated types) are written, per `PRD-Phase-3` Section 6, step 1 —
the schema files this ADR unblocks should already follow the policy
rather than being retrofitted to it.

## Decision

**Additive-only, per-`eventType`, integer `eventVersion`, no Schema
Registry.**

- Every event's envelope carries `eventType` (e.g.
  `MISSION_PROCESSING_REQUESTED`) and `eventVersion` (a positive
  integer, starting at `1`), exactly as `Coding_Standards.md` specifies.
  Versioning is scoped **per `eventType`**, not globally across the
  envelope or the whole platform — `MISSION_PROCESSING_REQUESTED` and
  `PROCESSING_STARTED` version independently.
- Within the same `eventVersion`, only additive, backward-compatible
  changes are allowed to a payload schema: new optional fields, new enum
  members a consumer can safely ignore, widened (never narrowed) value
  ranges. Consumers must ignore unknown payload fields rather than
  rejecting the message (`packages/event-schemas`' generated TS types
  and the Pydantic model both use "extra fields ignored," not "extra
  fields forbidden," for payload objects — the envelope's own top-level
  keys stay closed/required, since those are the contract every consumer
  hard-depends on).
- Any breaking change — removing/renaming a required field, narrowing a
  type, changing field semantics, removing an enum member a consumer
  might match on — bumps `eventVersion` for that `eventType`. The old
  and new versions may coexist on the same topic during a migration
  window; a consumer branches on `eventVersion` (a `switch`/`match`) and
  each branch declares which versions it understands. There is no
  requirement to support every historical version forever — the
  requirement is only that bumping the number, not silently changing
  shape, is how a breaking change is signaled.
- No Schema Registry (Confluent-style or otherwise) validates messages
  at the broker at runtime, consistent with `ADR-003`. Compatibility is
  enforced by: (a) the JSON Schema files in `packages/event-schemas`
  being the single source of truth for both the generated TS types and
  the Pydantic model, and (b) a CI check (REQ-3.4) that fails the build
  if the TS types, the Pydantic model, and the JSON Schema drift apart.
  A schema-breaking PR is caught by that CI check plus normal code
  review, not by a runtime gate.
- New `eventType`s (e.g. Phase 5 adding real `aidefense.detections`
  payloads) start at `eventVersion: 1` and follow the same rule from
  day one — this ADR is not Phase-3-scoped, it is the platform-wide
  policy for every topic this repo ever adds.

## Alternatives considered

### Alternative A — Global envelope version (one number for the whole platform)

A single `eventVersion` bumped whenever *any* event's shape changes
anywhere in the platform. Rejected: it forces every consumer to care
about changes to event types it doesn't even read, and produces a
constantly-incrementing number that stops meaningfully communicating
"did the thing I actually consume change." Per-`eventType` versioning
keeps the blast radius of a bump limited to the consumers that read that
one event type.

### Alternative B — Schema Registry with enforced compatibility mode (e.g. Confluent `BACKWARD`)

Would give a runtime guarantee instead of a convention-plus-CI one — a
producer literally cannot publish an incompatible message. Rejected for
Phase 3 for the same reason `ADR-003` rejected Confluent Platform
locally: it is infrastructure this MVP doesn't need yet given the
platform has a single producer and a small, known set of consumers per
topic (not an open ecosystem of third-party producers). Revisit if a
future phase adds external/third-party producers against these topics.

### Alternative C — SemVer-style `major.minor` string version

More expressive (minor bumps could be documented as informational
without changing consumer behavior) but adds parsing complexity for no
behavioral gain in this platform's current scale — an integer that only
changes on a breaking change is simpler to branch code on
(`if (event.eventVersion >= 2)`) than a semver string, and this
platform's compatibility policy only has two states (compatible/not)
that a single integer already captures.

## Consequences

### Positive

- Consumers only need to reason about compatibility for the event types
  they actually read, not the whole platform's event catalogue.
- The additive-only rule inside a version means most schema evolution
  (the common case — adding an optional field) needs no version bump,
  no consumer code change, and no coordinated deploy.
- No Schema Registry to run, operate, or explain locally, consistent
  with `ADR-003`'s local-Compose simplicity goal.

### Negative

- Nothing stops a producer from *accidentally* shipping a breaking
  change without bumping `eventVersion` — the CI sync check (REQ-3.4)
  catches schema/type/model drift, but it cannot catch "this field's
  semantic meaning silently changed while its JSON type stayed the
  same." This is a code-review responsibility, not a tooling guarantee.
- Consumers that need to support multiple concurrent `eventVersion`s for
  the same `eventType` (during a migration window) carry a small amount
  of branching logic that a Schema Registry's server-side validation
  would otherwise make unnecessary.

### Risks

- Redpanda-vs-production-Kafka divergence is unaffected by this
  decision (see `ADR-003`) — this ADR is orthogonal to broker choice.
- If the platform later gains external/third-party producers, the
  "convention plus CI, not a runtime gate" model stops being sufficient
  and Alternative B should be revisited.

## Migration and rollback

Adding a Schema Registry later does not require renumbering any existing
`eventVersion` — the registry would simply start validating the already-
established per-`eventType` version sequence. No migration is needed to
adopt this ADR itself: it governs schemas that don't have real content
until this same phase.

## Review date

Revisit if/when a future phase introduces a producer for these topics
that isn't part of this monorepo (external/third-party integration), or
before Phase 12 if the production Kafka distribution decision (`ADR-003`
review date) also brings a managed Schema Registry into scope.

---

## Related Notes

- [[PRD-Phase-3]] — REQ-3.5 (this ADR), REQ-3.3/3.4 (the schemas this
  policy governs).
- [[Coding_Standards]] — the envelope shape (`eventVersion` field) this
  ADR defines the semantics of.
- [[ADR-003-kafka-distribution-local-compose]] — the Schema Registry
  deferral this ADR's "no registry" decision extends.
- [[Local_Kafka_Redpanda]] — where the resulting schema files and topic
  taxonomy are documented.
