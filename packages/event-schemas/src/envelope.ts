import { randomUUID } from "node:crypto";

/**
 * Event envelope — TS mirror of schemas/event-envelope.schema.json, per
 * docs/architecture/Coding_Standards.md's Events section and
 * docs/adr/ADR-005-event-schema-versioning.md's versioning policy.
 *
 * There is no code generator wiring the JSON Schema, this type, and
 * apps/vision-service's Pydantic model together — they are kept in sync
 * by hand and verified by
 * apps/vision-service/tests/test_event_schema_sync.py (REQ-3.4), which
 * fails CI the moment `ENVELOPE_FIELD_NAMES` below drifts from either
 * the schema file's `properties` or the Pydantic model's fields.
 */
export interface EventEnvelope<TPayload = unknown> {
  readonly eventId: string;
  readonly eventType: string;
  readonly eventVersion: number;
  readonly occurredAt: string;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly producer: string;
  readonly payload: TPayload;
}

/**
 * Membership (not order) must match event-envelope.schema.json's
 * `properties` keys and the Pydantic `EventEnvelope`'s fields exactly —
 * see the sync check referenced above.
 */
export const ENVELOPE_FIELD_NAMES = [
  "eventId",
  "eventType",
  "eventVersion",
  "occurredAt",
  "correlationId",
  "causationId",
  "producer",
  "payload",
] as const;

export interface CreateEnvelopeInput<TPayload> {
  readonly eventType: string;
  readonly eventVersion: number;
  readonly producer: string;
  readonly payload: TPayload;
  /** Defaults to a fresh UUID — pass the originating HTTP request's correlation ID (REQ-3.11) when one exists. */
  readonly correlationId?: string;
  /** REQ-3.12: the eventId of the event that triggered this one. Omit/null for an event with no upstream event (e.g. produced directly from an HTTP request). */
  readonly causationId?: string | null;
}

/**
 * Builds a new envelope with a fresh `eventId`/`occurredAt`. Callers
 * that need the *same* `eventId` across retries (e.g.
 * apps/outbox-publisher re-publishing an outbox row) must generate the
 * id once and pass it through their own storage, not call this twice
 * for the same logical event.
 */
export function createEnvelope<TPayload>(
  input: CreateEnvelopeInput<TPayload>,
): EventEnvelope<TPayload> {
  return {
    eventId: randomUUID(),
    eventType: input.eventType,
    eventVersion: input.eventVersion,
    occurredAt: new Date().toISOString(),
    correlationId: input.correlationId ?? randomUUID(),
    causationId: input.causationId ?? null,
    producer: input.producer,
    payload: input.payload,
  };
}
