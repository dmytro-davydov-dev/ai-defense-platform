import { Module } from "@nestjs/common";
import { ProcessedEventsRepository } from "./processed-events.repository";

@Module({
  providers: [ProcessedEventsRepository],
  exports: [ProcessedEventsRepository],
})
export class ProcessedEventsModule {}
