import { ApiProperty } from "@nestjs/swagger";
import type { TelemetryRecord } from "../telemetry.types";

class TelemetryGeometryDto {
  @ApiProperty({ enum: ["LineString"] }) type!: "LineString";
  @ApiProperty({ type: [Array], example: [[-122.4194, 37.7749]] })
  coordinates!: [number, number][];
}

class TelemetryPropertiesDto {
  @ApiProperty() missionId!: string;
  @ApiProperty() pointCount!: number;
  /**
   * REQ-7.7: baked into the API contract itself, not left to the
   * frontend to remember — every consumer of this endpoint gets an
   * explicit, machine-readable signal that these coordinates are
   * estimated, never verified targeting data, per the roadmap's Phase 7
   * safety constraint.
   */
  @ApiProperty({ enum: [true] }) approximate!: true;
  @ApiProperty({ type: [String] }) timestamps!: string[];
  @ApiProperty({ type: [Number], nullable: true }) altitudesM!: (
    number | null
  )[];
  @ApiProperty({ type: [Number], nullable: true }) headingsDeg!: (
    number | null
  )[];
  @ApiProperty({ type: [Number], nullable: true }) speedsMps!: (
    number | null
  )[];
}

/**
 * REQ-7.3: response shape for `GET /missions/:id/telemetry` — a single
 * GeoJSON `Feature<LineString>` with parallel per-point property
 * arrays, ready to feed straight into a MapLibre GeoJSON source
 * (REQ-7.5) with no frontend-side reshaping. Intentionally a different
 * document shape from the ingestion side's `FeatureCollection<Point>`
 * (`telemetry-parser.ts`) — read and write have different natural
 * ergonomics here.
 */
export class TelemetryResponseDto {
  @ApiProperty({ enum: ["Feature"] }) type!: "Feature";
  @ApiProperty({ type: TelemetryGeometryDto }) geometry!: TelemetryGeometryDto;
  @ApiProperty({ type: TelemetryPropertiesDto })
  properties!: TelemetryPropertiesDto;

  static fromRecords(
    missionId: string,
    records: TelemetryRecord[],
  ): TelemetryResponseDto {
    const dto = new TelemetryResponseDto();
    dto.type = "Feature";
    dto.geometry = {
      type: "LineString",
      coordinates: records.map((record) => [record.lon, record.lat]),
    };
    dto.properties = {
      missionId,
      pointCount: records.length,
      approximate: true,
      timestamps: records.map((record) => record.capturedAt.toISOString()),
      altitudesM: records.map((record) => record.altitudeM),
      headingsDeg: records.map((record) => record.headingDeg),
      speedsMps: records.map((record) => record.speedMps),
    };
    return dto;
  }
}
