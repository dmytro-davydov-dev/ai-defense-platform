---
title: "ADR-003: Kafka distribution for local Docker Compose — Redpanda"
type: adr
tags: [adr, kafka, infrastructure, phase1]
status: accepted
---

# ADR-003: Kafka distribution for local Docker Compose — Redpanda

- Status: Accepted
- Date: 2026-07-13
- Decision owners: Dmytro
- Related documents: [[PRD-Phase-1]], [[Technology_Decisions]], [[AI_Defense_Platform_Roadmap]]

## Context

`Technology_Decisions.md` already commits the platform to Apache Kafka
(durable event streams, replay, consumer groups) for asynchronous
processing, starting with real topics and producers/consumers in Phase 3. REQ-1.16 requires Kafka to be present in
`infrastructure/compose/docker-compose.yml` in Phase 1 — before any
topics, schemas, or consumers exist — purely so the local stack boots
with the full topology from day one and Phase 3 doesn't have to touch
Compose's core service list. REQ-1.17 requires every Compose service to
reach a healthy state with no manual steps, which for Kafka historically
means also running and health-checking ZooKeeper.

This is a local-development decision only: it does not change the
`Technology_Decisions.md` commitment to the Kafka protocol/ecosystem,
and it does not preclude a different distribution being used in a later
non-local deployment target (Phase 12, Kubernetes).

## Decision

Use **Redpanda** (single-binary, Kafka-API-compatible, KRaft-equivalent
built-in, no ZooKeeper) as the Kafka distribution in
`infrastructure/compose/docker-compose.yml` for local development.

- One `redpanda` service, `docker.redpanda.com/redpandadata/redpanda`
  image, exposes the Kafka API on `9092` (internal) and the Admin/HTTP
  Proxy where useful for debugging.
- No separate ZooKeeper (or KRaft controller) service is needed —
  Redpanda embeds its own Raft-based metadata layer.
- Application code (`apps/outbox-publisher` from Phase 3,
  `apps/vision-service`'s consumer from Phase 4) targets the standard
  Kafka client protocol, so it is unaffected by which distribution
  Compose runs — this is what keeps the choice reversible.

## Alternatives considered

### Alternative A — Bitnami Kafka (KRaft mode)

Real Apache Kafka, no ZooKeeper (KRaft mode), closest to what a
production Kafka deployment would run. Rejected as the local-Compose
default because it is heavier (JVM startup time, memory footprint) than
Redpanda for a stack that already also runs Postgres+PostGIS and MinIO
alongside three app shells, and Phase 1's only requirement is a
Kafka-protocol-compatible broker that starts fast and reliably — not
byte-for-byte production parity.

### Alternative B — Confluent Platform images

Includes Schema Registry out of the box, which is attractive given
`packages/event-schemas` and the Phase 3 event-envelope work. Rejected
for local Compose because it is the heaviest option (multiple
containers, more memory, slower cold start) and its licensing/image
distribution model is more restrictive than Redpanda's or Bitnami's for
a local dev stack. Schema Registry, if wanted, can be added later
without changing the broker choice.

## Consequences

### Positive

- Fastest local startup and lowest memory footprint among the three
  options, which matters because Compose (REQ-1.16) already runs five
  other services alongside it.
- No ZooKeeper service to configure, health-check, or explain in
  onboarding docs (REQ-1.17, REQ-1.22).
- Kafka-API-compatible, so Phase 3's producer/consumer code and
  `packages/event-schemas` are unaffected by this choice.

### Negative

- Redpanda is not Apache Kafka itself; a small number of
  broker-operational features (e.g. some JMX-based tooling) don't apply.
  Not a concern for the MVP, which never manages Kafka operationally
  beyond topic creation and consumption.
- If a future phase specifically wants to exercise real Kafka-broker
  operational behavior (e.g. rebalance timing, JVM GC tuning under
  load — relevant to Phase 13's deferred load/resilience testing), the
  local stack won't reproduce that exactly.

### Risks

- Divergence between local Redpanda behavior and a future production
  Kafka (if Phase 12+ picks Confluent Cloud or MSK) in edge cases.
  Mitigation: all application code goes through the standard Kafka
  client protocol and `packages/event-schemas`, never a Redpanda-specific
  API, keeping the blast radius of this decision limited to Compose.

## Migration and rollback

Swapping the `redpanda` service for `bitnami/kafka` or Confluent images
in `docker-compose.yml` requires no application code changes, since
producers/consumers target the Kafka protocol on a configurable
bootstrap-server address — only the Compose service definition and
possibly resource limits change.

## Review date

Revisit before Phase 12 (Kubernetes / non-local deployment target),
when the production Kafka distribution is chosen.

---

## Related Notes

- [[PRD-Phase-1]] — REQ-1.16/1.17 require Kafka in Compose from Phase 1.
- [[Technology_Decisions]] — the platform-level commitment to Apache
  Kafka this ADR narrows to a local-Compose distribution choice.
- [[MVP_Implementation_Plan]] — Phase 3 (Kafka Event Platform) is the
  first phase to actually produce/consume against this broker.
