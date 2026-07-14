import { EVENT_TYPES, EVENT_VERSIONS, TOPICS } from "@ai-defense/event-schemas";
import type { EventEnvelope, Topic } from "@ai-defense/event-schemas";
import type { OutboxRow } from "./outbox-row.js";

/**
 * REQ-3.1: which topic each outbox `eventType` is published to. Phase 3
 * only ever writes MISSION_PROCESSING_REQUESTED rows (REQ-3.6); this map
 * exists so a future eventType added to the outbox doesn't silently
 * land on the wrong topic — it fails loudly instead (see
 * `topicForEventType`).
 */
const EVENT_TYPE_TOPICS: Partial<Record<string, Topic>> = {
  [EVENT_TYPES.MISSION_PROCESSING_REQUESTED]: TOPICS.COMMANDS,
};

export function topicForEventType(eventType: string): Topic {
  const topic = EVENT_TYPE_TOPICS[eventType];
  if (!topic) {
    throw new Error(`OUTBOX_UNKNOWN_EVENT_TYPE:${eventType}`);
  }
  return topic;
}

/**
 * Builds the Kafka envelope from an already-persisted outbox row —
 * reuses the row's `eventId`/`correlationId`/`causationId`/`createdAt`
 * rather than generating fresh ones, so a republish attempt (REQ-3.7's
 * at-least-once delivery) sends an identical envelope every time. This
 * is what lets consumers' `processed_events` check (REQ-3.8) recognize
 * a redelivered command as the same event.
 */
export function buildEnvelopeFromOutboxRow(row: OutboxRow): EventEnvelope {
  // Looked up via a widened Record<string, number> (not `as keyof typeof
  // EVENT_VERSIONS`) — row.eventType is a plain string read from the
  // database, not provably one of EVENT_VERSIONS' keys, so the lookup
  // is honestly `number | undefined` and the `?? 1` fallback is real,
  // not just satisfying a misleading cast.
  const eventVersion = (EVENT_VERSIONS as Record<string, number>)[row.eventType] ?? 1;

  return {
    eventId: row.eventId,
    eventType: row.eventType,
    eventVersion,
    occurredAt: row.createdAt.toISOString(),
    // Falls back to the eventId only for a row somehow written without
    // one (shouldn't happen — apps/api's OutboxRepository always sets
    // it) rather than crashing the publisher over a cosmetic field.
    correlationId: row.correlationId ?? row.eventId,
    causationId: row.causationId,
    producer: row.aggregateType === "mission" ? "api" : "unknown",
    payload: row.payload,
  };
}
