import { ApiProperty } from "@nestjs/swagger";

/** REQ-7.2: response shape for `POST /missions/:id/telemetry` — a simple ingest confirmation, not the full route (fetch that via `GET /missions/:id/telemetry`, REQ-7.3). */
export class TelemetryIngestResponseDto {
  @ApiProperty() missionId!: string;
  @ApiProperty() pointCount!: number;
}
