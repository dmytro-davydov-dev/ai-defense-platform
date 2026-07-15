import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { StorageModule } from "../storage/storage.module";
import { OutboxModule } from "../outbox/outbox.module";
import { DetectionsModule } from "../detections/detections.module";
import { MissionsController } from "./missions.controller";
import { MissionsService } from "./missions.service";
import { MissionsRepository } from "./missions.repository";

@Module({
  imports: [AuditModule, StorageModule, OutboxModule, DetectionsModule],
  controllers: [MissionsController],
  providers: [MissionsService, MissionsRepository],
  exports: [MissionsService],
})
export class MissionsModule {}
