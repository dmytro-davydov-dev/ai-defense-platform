/**
 * REQ-3.6: input for a single outbox row. `eventId` is generated inside
 * `OutboxRepository.insert()` (not passed in) so every row gets exactly
 * one identity, reused unchanged by apps/outbox-publisher across
 * at-least-once republish attempts (REQ-3.7) and by consumers'
 * processed_events checks (REQ-3.8).
 */
export interface CreateOutboxRowInput {
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly payload: object;
  /** REQ-3.11: the originating HTTP request's correlation ID, when one exists. */
  readonly correlationId?: string | undefined;
  /** REQ-3.12: eventId of the event that caused this one, or omitted/null when there is none (e.g. triggered directly by an HTTP request). */
  readonly causationId?: string | null | undefined;
}
