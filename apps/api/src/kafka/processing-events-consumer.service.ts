import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Kafka } from "kafkajs";
import type { Consumer, EachMessagePayload, Producer } from "kafkajs";
import { TOPICS } from "@ai-defense/event-schemas";
import { MissionsService } from "../missions/missions.service";
import { ProcessedEventsRepository } from "../processed-events/processed-events.repository";
import { handleProcessingEventMessage } from "./processing-events.handler";

/**
 * REQ-3.14: consumes `aidefense.processing-events` and drives
 * `MissionsService.transition()`. The real kafkajs wiring lives here;
 * `handleProcessingEventMessage` (processing-events.handler.ts) has the
 * actual idempotency/retry/DLQ logic and is what's unit-tested.
 */
@Injectable()
export class ProcessingEventsConsumerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ProcessingEventsConsumerService.name);
  private consumer: Consumer | undefined;
  private dlqProducer: Producer | undefined;

  constructor(
    private readonly missionsService: MissionsService,
    private readonly processedEventsRepository: ProcessedEventsRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    const brokers = (process.env["KAFKA_BROKERS"] ?? "")
      .split(",")
      .map((broker) => broker.trim())
      .filter((broker) => broker.length > 0);
    if (brokers.length === 0) {
      // Consistent with StorageService/PrismaService's loud-fail-on-missing-config
      // pattern would be tempting here, but a missing KAFKA_BROKERS
      // shouldn't take down the whole HTTP API — REQ-3.14 is additive
      // to REQ-2.7/2.8's synchronous mission CRUD, not a replacement
      // for it. Log loudly and continue without a consumer instead.
      this.logger.warn(
        "KAFKA_BROKERS not set — processing-events consumer disabled",
      );
      return;
    }

    const kafka = new Kafka({
      clientId: "api-processing-events-consumer",
      brokers,
    });

    // Captured as a local (non-optional `Producer`) rather than read
    // back off `this.dlqProducer` inside the closure below, so the
    // handler never needs a non-null assertion to satisfy
    // `ProcessingEventsHandlerDeps`'s required `dlqProducer`.
    const dlqProducer = kafka.producer();
    await dlqProducer.connect();
    this.dlqProducer = dlqProducer;

    this.consumer = kafka.consumer({ groupId: "api-processing-events" });
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: TOPICS.PROCESSING_EVENTS,
      fromBeginning: false,
    });
    await this.consumer.run({
      eachMessage: async ({ message }: EachMessagePayload) => {
        if (!message.value) {
          return;
        }
        await handleProcessingEventMessage(message.value.toString(), {
          missionsService: this.missionsService,
          processedEventsRepository: this.processedEventsRepository,
          dlqProducer,
        });
      },
    });
    this.logger.log(`Subscribed to ${TOPICS.PROCESSING_EVENTS}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer?.disconnect();
    await this.dlqProducer?.disconnect();
  }
}
