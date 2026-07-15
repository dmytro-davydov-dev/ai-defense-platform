import {
  Inject,
  Injectable,
  Logger,
  Optional,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Kafka } from "kafkajs";
import type { Consumer, EachMessagePayload, Producer } from "kafkajs";
import { TOPICS } from "@ai-defense/event-schemas";
import { DetectionsService } from "./detections.service";
import { ProcessedEventsRepository } from "../processed-events/processed-events.repository";
import {
  MISSION_EVENTS_PUBLISHER,
  type MissionEventsPublisherLike,
} from "../realtime/mission-events-publisher";
import { handleDetectionMessage } from "./detections.handler";

/**
 * REQ-6.1: consumes `aidefense.detections` and persists every retained
 * detection via `DetectionsService`. Own consumer group
 * (`api-detections`) so this consumer's offsets/idempotency records are
 * independent of `ProcessingEventsConsumerService`'s — the two topics
 * are consumed at different rates (one detection-event per retained
 * detection vs. one processing-event per mission-lifecycle milestone)
 * and a slow/failing detections consumer must never block mission
 * status transitions, or vice versa. Real kafkajs wiring lives here;
 * `handleDetectionMessage` (detections.handler.ts) has the actual
 * idempotency/retry/DLQ logic and is what's unit-tested.
 */
@Injectable()
export class DetectionsConsumerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(DetectionsConsumerService.name);
  private consumer: Consumer | undefined;
  private dlqProducer: Producer | undefined;

  constructor(
    private readonly detectionsService: DetectionsService,
    private readonly processedEventsRepository: ProcessedEventsRepository,
    @Optional()
    @Inject(MISSION_EVENTS_PUBLISHER)
    private readonly realtimePublisher?: MissionEventsPublisherLike,
  ) {}

  async onModuleInit(): Promise<void> {
    const brokers = (process.env["KAFKA_BROKERS"] ?? "")
      .split(",")
      .map((broker) => broker.trim())
      .filter((broker) => broker.length > 0);
    if (brokers.length === 0) {
      // Same "warn and continue without a consumer" posture as
      // ProcessingEventsConsumerService — a missing KAFKA_BROKERS
      // shouldn't take down the whole HTTP API.
      this.logger.warn("KAFKA_BROKERS not set — detections consumer disabled");
      return;
    }

    const kafka = new Kafka({
      clientId: "api-detections-consumer",
      brokers,
    });

    const dlqProducer = kafka.producer();
    await dlqProducer.connect();
    this.dlqProducer = dlqProducer;

    this.consumer = kafka.consumer({ groupId: "api-detections" });
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: TOPICS.DETECTIONS,
      fromBeginning: false,
    });
    await this.consumer.run({
      eachMessage: async ({ message }: EachMessagePayload) => {
        if (!message.value) {
          return;
        }
        await handleDetectionMessage(message.value.toString(), {
          detectionsService: this.detectionsService,
          processedEventsRepository: this.processedEventsRepository,
          dlqProducer,
          realtimePublisher: this.realtimePublisher,
        });
      },
    });
    this.logger.log(`Subscribed to ${TOPICS.DETECTIONS}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer?.disconnect();
    await this.dlqProducer?.disconnect();
  }
}
