/**
 * Per-eventType payload types, TS mirror of schemas/*.schema.json. See
 * envelope.ts's header comment for how these are kept in sync with the
 * JSON Schema and apps/vision-service's Pydantic models.
 */

export const EVENT_TYPES = {
  MISSION_PROCESSING_REQUESTED: "MISSION_PROCESSING_REQUESTED",
  PROCESSING_STARTED: "PROCESSING_STARTED",
  PROCESSING_COMPLETED: "PROCESSING_COMPLETED",
  PROCESSING_FAILED: "PROCESSING_FAILED",
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

/** ADR-005: eventVersion is scoped per eventType, not global. */
export const EVENT_VERSIONS: Record<EventType, number> = {
  MISSION_PROCESSING_REQUESTED: 1,
  PROCESSING_STARTED: 1,
  PROCESSING_COMPLETED: 1,
  PROCESSING_FAILED: 1,
};

export interface MissionProcessingRequestedPayload {
  readonly missionId: string;
  readonly videoObjectKey: string;
}
export const MISSION_PROCESSING_REQUESTED_FIELD_NAMES = ["missionId", "videoObjectKey"] as const;

export interface ProcessingStartedPayload {
  readonly missionId: string;
}
export const PROCESSING_STARTED_FIELD_NAMES = ["missionId"] as const;

export interface ProcessingCompletedPayload {
  readonly missionId: string;
  readonly note: string;
}
export const PROCESSING_COMPLETED_FIELD_NAMES = ["missionId", "note"] as const;

export interface ProcessingFailedPayload {
  readonly missionId: string;
  readonly reason: string;
}
export const PROCESSING_FAILED_FIELD_NAMES = ["missionId", "reason"] as const;

export interface DeadLetterPayload {
  readonly originalEvent: unknown;
  readonly failureReason: string;
  readonly attempts: number;
  readonly topic: string;
}
export const DEAD_LETTER_FIELD_NAMES = [
  "originalEvent",
  "failureReason",
  "attempts",
  "topic",
] as const;
