import { log } from "@ai-defense/observability";
import { TOPICS } from "@ai-defense/event-schemas";
import type { EventEnvelope } from "@ai-defense/event-schemas";
import { MissionStatus } from "../../generated/prisma/client";
import type { MissionsService } from "../missions/missions.service";
import type { ProcessedEventsRepository } from "../processed-events/processed-events.repository";
import { withBoundedRetry } from "./retry.util";
import { buildDeadLetterEnvelope } from "./dead-letter";
import type { KafkaProducerLike } from "./kafka-producer-like";
import type { MissionEventsPublisherLike } from "../realtime/mission-events-publisher";

const CONSUMER_NAME = "api";
const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 200;

/** REQ-3.14: which mission state each processing-event moves a mission to. */
const EVENT_TYPE_TARGET_STATUS: Partial<Record<string, MissionStatus>> = {
  PROCESSING_STARTED: MissionStatus.PROCESSING,
  PROCESSING_COMPLETED: MissionStatus.COMPLETED,
  PROCESSING_FAILED: MissionStatus.FAILED,
};

export interface ProcessingEventsHandlerDeps {
  readonly missionsService: Pick<MissionsService, "transition">;
  readonly processedEventsRepository: Pick<
    ProcessedEventsRepository,
    "markProcessed"
  >;
  readonly dlqProducer: KafkaProducerLike;
  /** REQ-6.5: optional so this stays callable without wiring RealtimeModule (e.g. existing tests). */
  readonly realtimePublisher?: MissionEventsPublisherLike | undefined;
}

interface ProcessingEventPayload {
  readonly missionId: string;
}

/**
 * REQ-3.8/3.9/3.11/3.14: one `aidefense.processing-events` message,
 * start to finish — idempotency check, bounded-retry
 * `MissionsService.transition()`, and dead-letter on exhaustion. Kept
 * free of any real kafkajs types so it's unit-testable without a
 * broker (ProcessingEventsConsumerService wires this to a real
 * `Consumer`/`Producer`).
 */
export async function handleProcessingEventMessage(
  rawValue: string,
  deps: ProcessingEventsHandlerDeps,
): Promise<void> {
  const envelope = JSON.parse(
    rawValue,
  ) as EventEnvelope<ProcessingEventPayload>;
  const logContext = {
    eventId: envelope.eventId,
    eventType: envelope.eventType,
    correlationId: envelope.correlationId,
  };

  const targetStatus = EVENT_TYPE_TARGET_STATUS[envelope.eventType];
  if (!targetStatus) {
    log(
      "warn",
      "processing-events consumer: unknown eventType, skipping",
      logContext,
    );
    return;
  }

  // REQ-3.8: idempotency check-and-record before any side effect runs.
  const isNewEvent = await deps.processedEventsRepository.markProcessed(
    envelope.eventId,
    CONSUMER_NAME,
  );
  if (!isNewEvent) {
    log(
      "info",
      "processing-events consumer: duplicate delivery, skipping",
      logContext,
    );
    return;
  }

  const succeeded = await withBoundedRetry(
    async () => {
      await deps.missionsService.transition(
        envelope.payload.missionId,
        targetStatus,
        {
          correlationId: envelope.correlationId,
        },
      );
    },
    { attempts: RETRY_ATTEMPTS, baseDelayMs: RETRY_BASE_DELAY_MS },
    (attempt, error) => {
      log("warn", "processing-events consumer: transition attempt failed", {
        ...logContext,
        attempt,
        error: error instanceof Error ? error.message : String(error),
      });
    },
  );

  if (succeeded) {
    log("info", "processing-events consumer: mission transitioned", {
      ...logContext,
      missionId: envelope.payload.missionId,
      targetStatus,
    });
    // REQ-6.5: best-effort relay to any browser tab subscribed to this
    // mission's real-time channel — never fails the message itself.
    deps.realtimePublisher?.publishMissionEvent(envelope.payload.missionId, {
      eventType: envelope.eventType,
      payload: envelope.payload,
    });
    return;
  }

  const dlqEnvelope = buildDeadLetterEnvelope(
    envelope,
    TOPICS.PROCESSING_EVENTS,
    "MISSION_TRANSITION_FAILED_AFTER_RETRIES",
    RETRY_ATTEMPTS,
    "api",
  );
  await deps.dlqProducer.send({
    topic: TOPICS.DEAD_LETTER,
    messages: [
      { key: envelope.payload.missionId, value: JSON.stringify(dlqEnvelope) },
    ],
  });
  log(
    "error",
    "processing-events consumer: exhausted retries, dead-lettered",
    logContext,
  );
}
