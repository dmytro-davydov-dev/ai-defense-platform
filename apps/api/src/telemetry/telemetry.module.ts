import { Module } from "@nestjs/common";
import { TelemetryService } from "./telemetry.service";
import { TelemetryRepository } from "./telemetry.repository";

/**
 * REQ-7.1/7.2/7.3: owns telemetry persistence and parsing. Exports
 * `TelemetryService` so `MissionsController`'s
 * `POST`/`GET /missions/:id/telemetry` routes can use it without
 * depending on the repository directly — the same shape as
 * `DetectionsModule`/`AuditModule` being imported by `MissionsModule`.
 */
@Module({
  providers: [TelemetryService, TelemetryRepository],
  exports: [TelemetryService],
})
export class TelemetryModule {}
