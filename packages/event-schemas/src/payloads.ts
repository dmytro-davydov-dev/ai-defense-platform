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
  /** Phase 5 (docs/mvp-plan/PRD-Phase-5.md REQ-5.6). */
  DETECTION_PUBLISHED: "DETECTION_PUBLISHED",
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

/** ADR-005: eventVersion is scoped per eventType, not global. */
export const EVENT_VERSIONS: Record<EventType, number> = {
  MISSION_PROCESSING_REQUESTED: 1,
  PROCESSING_STARTED: 1,
  PROCESSING_COMPLETED: 1,
  PROCESSING_FAILED: 1,
  DETECTION_PUBLISHED: 1,
};

export interface MissionProcessingRequestedPayload {
  readonly missionId: string;
  readonly videoObjectKey: string;
}
export const MISSION_PROCESSING_REQUESTED_FIELD_NAMES = ["missionId", "videoObjectKey"] as const;

export interface ProcessingStartedPayload {
  readonly missionId: string;
  /** REQ-4.6, optional: absent for events still on the Phase 3 stub shape. */
  readonly durationSeconds?: number;
  readonly fps?: number;
  readonly width?: number;
  readonly height?: number;
  readonly frameCount?: number;
  readonly checksumSha256?: string;
}
export const PROCESSING_STARTED_FIELD_NAMES = [
  "missionId",
  "durationSeconds",
  "fps",
  "width",
  "height",
  "frameCount",
  "checksumSha256",
] as const;

export interface ProcessingCompletedPayload {
  readonly missionId: string;
  readonly note: string;
  /** REQ-4.10, optional: real frame count/duration once the Phase 4 pipeline is wired in. */
  readonly frameCount?: number;
  readonly processingDurationMs?: number;
  /** REQ-5.9, optional: populated once Phase 5's detection pipeline runs. */
  readonly detectionCount?: number;
  readonly trackCount?: number;
  /** REQ-5.7, optional: MinIO object key of the annotated output video. */
  readonly annotatedVideoObjectKey?: string;
}
export const PROCESSING_COMPLETED_FIELD_NAMES = [
  "missionId",
  "note",
  "frameCount",
  "processingDurationMs",
  "detectionCount",
  "trackCount",
  "annotatedVideoObjectKey",
] as const;

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

/**
 * Phase 5 (docs/mvp-plan/PRD-Phase-5.md REQ-5.6): published once per
 * retained (post-filter, post-tracking) detection to
 * `aidefense.detections`, mission ID as the partition key. Only
 * civilian/synthetic classes ever appear here — REQ-5.4's allow-list
 * (`apps/vision-service/src/vision_service/detection/classes.py`) is
 * enforced before this event is ever constructed.
 */
export interface DetectionBoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DetectionPublishedPayload {
  readonly missionId: string;
  /** 0-based index of the frame this detection was observed on. */
  readonly frameIndex: number;
  /** Milliseconds from the start of the video, derived from frameIndex/fps. */
  readonly frameTimestampMs: number;
  /** Stable ID from the in-house tracker (docs/adr/ADR-006-detection-model-and-tracker.md). */
  readonly trackId: number;
  readonly label: string;
  readonly confidence: number;
  readonly boundingBox: DetectionBoundingBox;
}
export const DETECTION_PUBLISHED_FIELD_NAMES = [
  "missionId",
  "frameIndex",
  "frameTimestampMs",
  "trackId",
  "label",
  "confidence",
  "boundingBox",
] as const;
