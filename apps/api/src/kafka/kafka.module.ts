import { Module } from "@nestjs/common";
import { MissionsModule } from "../missions/missions.module";
import { ProcessedEventsModule } from "../processed-events/processed-events.module";
import { ProcessingEventsConsumerService } from "./processing-events-consumer.service";

/** REQ-3.14: apps/api's Kafka-consuming side (as opposed to apps/outbox-publisher's producing side). */
@Module({
  imports: [MissionsModule, ProcessedEventsModule],
  providers: [ProcessingEventsConsumerService],
})
export class KafkaModule {}
