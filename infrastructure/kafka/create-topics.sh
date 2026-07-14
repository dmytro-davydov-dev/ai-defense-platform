#!/bin/sh
# Declarative topic taxonomy creation — PRD-Phase-3 REQ-3.1/3.2.
# Run automatically by the `kafka-init` one-shot service in
# infrastructure/compose/docker-compose.yml right after `redpanda`
# reports healthy, so a fresh `docker compose up` reaches the full
# topology with no manual `rpk topic create` step (same guarantee
# REQ-1.17 already makes for the other services).
#
# Idempotent: safe to run against a broker that already has some/all of
# these topics (e.g. every `docker compose up` on an existing volume).
#
# Keep infrastructure/kafka/topics.json's `topics` array in sync with
# the TOPICS list below if the taxonomy changes — topics.json is the
# documented/human-readable copy, this script is what actually runs.
set -eu

BROKERS="${REDPANDA_BROKERS:-redpanda:9092}"

# name:partitions. Replication factor is always 1 (single-broker local
# Redpanda, ADR-003-kafka-distribution-local-compose.md). Mission-scoped
# topics (commands/processing-events/detections) get multiple partitions
# so REQ-3.2's mission-ID partition key actually distributes load; the
# three not-yet-produced topics (telemetry/audit/device-events) get one
# partition until a real producer needs more.
TOPICS="
aidefense.commands:6
aidefense.processing-events:6
aidefense.detections:6
aidefense.telemetry:1
aidefense.audit:1
aidefense.device-events:1
aidefense.dead-letter:3
"

echo "waiting for redpanda ($BROKERS) to accept admin requests..."
for i in $(seq 1 30); do
  if rpk cluster info --brokers "$BROKERS" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

for entry in $TOPICS; do
  name="${entry%%:*}"
  partitions="${entry##*:}"
  if rpk topic describe "$name" --brokers "$BROKERS" >/dev/null 2>&1; then
    echo "topic $name already exists, skipping"
  else
    echo "creating topic $name (partitions=$partitions, replicas=1)"
    rpk topic create "$name" --partitions "$partitions" --replicas 1 --brokers "$BROKERS"
  fi
done

echo "topic taxonomy ready"
