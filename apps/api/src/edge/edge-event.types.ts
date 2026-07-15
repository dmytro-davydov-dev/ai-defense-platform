/**
 * Phase 9 (docs/mvp-plan/PRD-Phase-9.md REQ-9.6/9.7/9.11): one buffered
 * event an edge agent synchronizes via `POST /edge/events`. Only
 * `DEVICE_HEALTH_REPORTED` is accepted in this pass — edge-produced
 * detections are not mission-scoped (no `missionId`), so they cannot be
 * written into the existing `detections` table's `NOT NULL` foreign key
 * without a schema decision this phase's PRD deliberately left open
 * (see docs/mvp-plan/PRD-Phase-9.md Section 11's open question on
 * `aidefense.device-events`'s read side, and
 * docs/roadmap/Progress.md's Phase 9 Known gaps). Rejecting any other
 * `eventType` here fails loudly rather than silently accepting and
 * discarding it.
 */
export interface IngestEdgeEventInput {
  readonly eventId: string;
  readonly eventType: string;
  readonly occurredAt: string;
  readonly payload: Record<string, unknown>;
}

export interface IngestEdgeEventsResult {
  readonly accepted: number;
  readonly duplicates: number;
}

/** Thrown for an `eventType` this endpoint doesn't (yet) accept — see the module docstring above. */
export class UnsupportedEdgeEventTypeError extends Error {}
