/**
 * Phase 3 topic taxonomy (docs/mvp-plan/PRD-Phase-3.md REQ-3.1/3.2).
 * Kept here (not just in infrastructure/kafka/topics.json) so producer/
 * consumer code never hardcodes a topic-name string literal.
 */
export const TOPICS = {
  COMMANDS: "aidefense.commands",
  PROCESSING_EVENTS: "aidefense.processing-events",
  DETECTIONS: "aidefense.detections",
  TELEMETRY: "aidefense.telemetry",
  AUDIT: "aidefense.audit",
  DEVICE_EVENTS: "aidefense.device-events",
  DEAD_LETTER: "aidefense.dead-letter",
} as const;

export type Topic = (typeof TOPICS)[keyof typeof TOPICS];

/**
 * REQ-3.2: these topics use the mission ID as the Kafka partition key, to
 * preserve per-mission ordering. aidefense.telemetry/audit are not
 * mission-scoped and still have no producer/consumer (REQ-3.1 creates
 * them; deferred per PRD-Phase-3's open questions). aidefense.device-events
 * is also not mission-scoped, but as of Phase 9
 * (docs/mvp-plan/PRD-Phase-9.md REQ-9.11) it has a real producer —
 * `apps/api`'s `EdgeEventsService`, via the outbox — using `deviceId` as
 * its Kafka partition key instead of a mission ID.
 */
export const MISSION_SCOPED_TOPICS: readonly Topic[] = [
  TOPICS.COMMANDS,
  TOPICS.PROCESSING_EVENTS,
  TOPICS.DETECTIONS,
];
