import { log } from "@ai-defense/observability";
import { TOPICS } from "@ai-defense/event-schemas";
import type {
  DetectionPublishedPayload,
  EventEnvelope,
} from "@ai-defense/event-schemas";
import { withBoundedRetry } from "../kafka/retry.util";
import { buildDeadLetterEnvelope } from "../kafka/dead-letter";
import type { KafkaProducerLike } from "../kafka/kafka-producer-like";
import type { MissionEventsPublisherLike } from "../realtime/mission-events-publisher";
import type { DetectionsService } from "./detections.service";
import type { ProcessedEventsRepository } from "../processed-events/processed-events.repository";

const CONSUMER_NAME = "api-detections";
const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 200;

export interface DetectionsHandlerDeps {
  readonly detectionsService: Pick<DetectionsService, "record">;
  readonly processedEventsRepository: Pick<
    ProcessedEventsRepository,
    "markProcessed"
  >;
  readonly dlqProducer: KafkaProducerLike;
  /** REQ-6.5: optional so tests/callers that don't care about the real-time relay can omit it, same as a missing KAFKA_BROKERS is tolerated elsewhere. */
  readonly realtimePublisher?: MissionEventsPublisherLike | undefined;
}

/**
 * REQ-6.1: one `aidefense.detections` message, start to finish —
 * idempotency check (own consumer name, `api-detections`, distinct from
 * `processing-events.handler.ts`'s `api` so the same eventId space never
 * collides across the two independent consumer groups), bounded-retry
 * persistence, dead-letter on exhaustion, and a best-effort real-time
 * relay to any subscribed browser client. Mirrors
 * `processing-events.handler.ts`'s structure deliberately — same
 * REQ-3.8/3.9/3.10/3.11 machinery, a different payload and side effect.
 */
export async function handleDetectionMessage(
  rawValue: string,
  deps: DetectionsHandlerDeps,
): Promise<void> {
  const envelope = JSON.parse(
    rawValue,
  ) as EventEnvelope<DetectionPublishedPayload>;
  const logContext = {
    eventId: envelope.eventId,
    eventType: envelope.eventType,
    correlationId: envelope.correlationId,
  };

  if (envelope.eventType !== "DETECTION_PUBLISHED") {
    log("warn", "detections consumer: unknown eventType, skipping", logContext);
    return;
  }

  // REQ-3.8-style idempotency check-and-record before any side effect runs.
  const isNewEvent = await deps.processedEventsRepository.markProcessed(
    envelope.eventId,
    CONSUMER_NAME,
  );
  if (!isNewEvent) {
    log(
      "info",
      "detections consumer: duplicate delivery, skipping",
      logContext,
    );
    return;
  }

  const succeeded = await withBoundedRetry(
    async () => {
      await deps.detectionsService.record({
        missionId: envelope.payload.missionId,
        frameIndex: envelope.payload.frameIndex,
        frameTimestampMs: envelope.payload.frameTimestampMs,
        trackId: envelope.payload.trackId,
        label: envelope.payload.label,
        confidence: envelope.payload.confidence,
        boundingBox: envelope.payload.boundingBox,
      });
    },
    { attempts: RETRY_ATTEMPTS, baseDelayMs: RETRY_BASE_DELAY_MS },
    (attempt, error) => {
      log("warn", "detections consumer: persist attempt failed", {
        ...logContext,
        attempt,
        error: error instanceof Error ? error.message : String(error),
      });
    },
  );

  if (succeeded) {
    log("info", "detections consumer: detection persisted", {
      ...logContext,
      missionId: envelope.payload.missionId,
      trackId: envelope.payload.trackId,
    });
    // REQ-6.5: best-effort — a browser tab open on the mission detail
    // view sees the detection immediately; a closed/absent tab reads it
    // later via GET /missions/:id/detections (REQ-6.2), so a relay
    // failure here must never fail the message itself.
    deps.realtimePublisher?.publishMissionEvent(envelope.payload.missionId, {
      eventType: envelope.eventType,
      payload: envelope.payload,
    });
    return;
  }

  const dlqEnvelope = buildDeadLetterEnvelope(
    envelope,
    TOPICS.DETECTIONS,
    "DETECTION_PERSIST_FAILED_AFTER_RETRIES",
    RETRY_ATTEMPTS,
    "api",
  );
  await deps.dlqProducer.send({
    topic: TOPICS.DEAD_LETTER,
    messages: [
      {
        key: envelope.payload.missionId,
        value: JSON.stringify(dlqEnvelope),
      },
    ],
  });
  log(
    "error",
    "detections consumer: exhausted retries, dead-lettered",
    logContext,
  );
}
