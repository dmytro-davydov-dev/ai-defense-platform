import { Injectable } from "@nestjs/common";
import { EVENT_TYPES } from "@ai-defense/event-schemas";
import { OutboxRepository } from "../outbox/outbox.repository";
import { ProcessedEventsRepository } from "../processed-events/processed-events.repository";
import type { AuthenticatedDevice } from "../edge-auth/device-auth.types";
import { EdgeDevicesRepository } from "./edge-devices.repository";
import {
  UnsupportedEdgeEventTypeError,
  type IngestEdgeEventInput,
  type IngestEdgeEventsResult,
} from "./edge-event.types";

/** Matches every consumer name already in use (`api-detections`, etc.) — see REQ-3.8/REQ-6.1's `detections.handler.ts` for the sibling pattern. */
const EDGE_EVENTS_CONSUMER = "api-edge-events";

/**
 * PRD-Phase-9 (docs/mvp-plan/PRD-Phase-9.md) REQ-9.6/9.7/9.10/9.11,
 * docs/adr/ADR-011-device-identity-and-sync-transport.md: ingests a
 * batch of synchronized edge events. Idempotent per event (REQ-9.7,
 * reusing REQ-3.8's `processed_events` pattern) and republishes each
 * newly-accepted event via the existing generic `outbox` table +
 * `apps/outbox-publisher` — no second publishing path, no direct Kafka
 * client on this request path.
 *
 * `ProcessedEventsRepository.markProcessed()` always runs against the
 * top-level `PrismaService`, not an injectable transaction executor
 * (see its own module comment) — the same is true of every existing
 * Kafka consumer in this codebase (`processing-events.handler.ts`,
 * `detections.handler.ts`): the idempotency check and the side effect
 * it guards are two separate statements, not one atomic transaction.
 * This mirrors that established, accepted trade-off rather than
 * introducing a new one: a crash between `markProcessed` succeeding and
 * the outbox insert completing would leave an event marked processed
 * with no corresponding outbox row — a narrow, already-accepted window,
 * not specific to this endpoint.
 */
@Injectable()
export class EdgeEventsService {
  constructor(
    private readonly processedEventsRepository: ProcessedEventsRepository,
    private readonly outboxRepository: OutboxRepository,
    private readonly edgeDevicesRepository: EdgeDevicesRepository,
  ) {}

  async ingest(
    device: AuthenticatedDevice,
    events: readonly IngestEdgeEventInput[],
    correlationId: string | undefined,
  ): Promise<IngestEdgeEventsResult> {
    for (const event of events) {
      if (event.eventType !== EVENT_TYPES.DEVICE_HEALTH_REPORTED) {
        throw new UnsupportedEdgeEventTypeError(
          `eventType ${event.eventType} is not accepted by POST /edge/events yet`,
        );
      }
    }

    let accepted = 0;
    let duplicates = 0;

    for (const event of events) {
      const isNew = await this.processedEventsRepository.markProcessed(
        event.eventId,
        EDGE_EVENTS_CONSUMER,
      );
      if (!isNew) {
        duplicates += 1;
        continue;
      }

      // REQ-9.10: deviceId (the human-chosen label), not the surrogate
      // id, is the Kafka partition key/aggregateId — matches
      // topics.ts's documented "deviceId is the Kafka partition key"
      // convention for aidefense.device-events.
      await this.outboxRepository.insert({
        aggregateType: "edge_device",
        aggregateId: device.deviceId,
        eventType: event.eventType,
        payload: event.payload,
        correlationId,
        causationId: null,
      });
      accepted += 1;
    }

    await this.edgeDevicesRepository.touchSync(device.id);

    return { accepted, duplicates };
  }
}
