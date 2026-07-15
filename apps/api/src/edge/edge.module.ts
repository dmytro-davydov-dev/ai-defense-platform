import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EdgeAuthModule } from "../edge-auth/edge-auth.module";
import { OutboxModule } from "../outbox/outbox.module";
import { ProcessedEventsModule } from "../processed-events/processed-events.module";
import { EdgeDevicesController } from "./edge-devices.controller";
import { EdgeDevicesService } from "./edge-devices.service";
import { EdgeDevicesRepository } from "./edge-devices.repository";
import { EdgeEventsController } from "./edge-events.controller";
import { EdgeEventsService } from "./edge-events.service";

/**
 * PRD-Phase-9 (docs/mvp-plan/PRD-Phase-9.md) REQ-9.6/9.9/9.10: device
 * registration/lifecycle (`EdgeDevicesController`, admin-only, guarded
 * via `AuthModule`'s `JwtAuthGuard`/`RolesGuard`) and event
 * synchronization ingestion (`EdgeEventsController`, device-authenticated
 * only, via `EdgeAuthModule`'s `DeviceAuthGuard`) — a platform-level
 * module, not mission-scoped, registered alongside `DatasetsModule`/
 * `ModelRegistryModule` in `AppModule` rather than nested inside
 * `MissionsModule`.
 */
@Module({
  imports: [AuthModule, EdgeAuthModule, OutboxModule, ProcessedEventsModule],
  controllers: [EdgeDevicesController, EdgeEventsController],
  providers: [EdgeDevicesService, EdgeDevicesRepository, EdgeEventsService],
  exports: [EdgeDevicesService],
})
export class EdgeModule {}
