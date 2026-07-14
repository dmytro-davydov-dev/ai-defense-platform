import { randomUUID } from "node:crypto";
import type {
  DeadLetterPayload,
  EventEnvelope,
} from "@ai-defense/event-schemas";

/**
 * REQ-3.9/3.10: wraps an envelope that exhausted its retry budget for
 * publishing to `aidefense.dead-letter`, per
 * packages/event-schemas/src/schemas/dead-letter.schema.json.
 */
export function buildDeadLetterEnvelope(
  originalEnvelope: EventEnvelope,
  originalTopic: string,
  failureReason: string,
  attempts: number,
  producer: string,
): EventEnvelope<DeadLetterPayload> {
  return {
    eventId: randomUUID(),
    eventType: "EVENT_DEAD_LETTERED",
    eventVersion: 1,
    occurredAt: new Date().toISOString(),
    correlationId: originalEnvelope.correlationId,
    causationId: originalEnvelope.eventId,
    producer,
    payload: {
      originalEvent: originalEnvelope,
      failureReason,
      attempts,
      topic: originalTopic,
    },
  };
}
