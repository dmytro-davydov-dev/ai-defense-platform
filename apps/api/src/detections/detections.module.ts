import { Module } from "@nestjs/common";
import { ProcessedEventsModule } from "../processed-events/processed-events.module";
import { DetectionsService } from "./detections.service";
import { DetectionsRepository } from "./detections.repository";
import { DetectionsConsumerService } from "./detections-consumer.service";

/**
 * REQ-6.1/6.2: owns detection persistence and the
 * `aidefense.detections` consumer. Exports `DetectionsService` so
 * `MissionsController` (REQ-6.2's `GET /missions/:id/detections`) can
 * read persisted detections without depending on the Kafka-consuming
 * side directly — the same shape as `MissionsModule` already importing
 * `StorageModule` for the mission-scoped upload-url route.
 */
@Module({
  imports: [ProcessedEventsModule],
  providers: [
    DetectionsService,
    DetectionsRepository,
    DetectionsConsumerService,
  ],
  exports: [DetectionsService],
})
export class DetectionsModule {}
