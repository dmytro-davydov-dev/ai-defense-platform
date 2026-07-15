import { Module } from "@nestjs/common";
import { MissionsModule } from "../missions/missions.module";
import { ProcessedEventsModule } from "../processed-events/processed-events.module";
import { DetectionsModule } from "../detections/detections.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { ProcessingEventsConsumerService } from "./processing-events-consumer.service";

/**
 * REQ-3.14/6.1: apps/api's Kafka-consuming side (as opposed to
 * apps/outbox-publisher's producing side) — now two independent
 * consumers, processing-events and detections (REQ-6.1). `RealtimeModule`
 * is imported so both consumer services can inject the
 * `MISSION_EVENTS_PUBLISHER` token (REQ-6.5) and relay a successfully-
 * processed event to any subscribed browser client.
 */
@Module({
  imports: [
    MissionsModule,
    ProcessedEventsModule,
    DetectionsModule,
    RealtimeModule,
  ],
  providers: [ProcessingEventsConsumerService],
})
export class KafkaModule {}
