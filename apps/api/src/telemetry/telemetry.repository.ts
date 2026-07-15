import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { InsertTelemetryInput, TelemetryRecord } from "./telemetry.types";

interface TelemetryRow {
  id: string;
  missionId: string;
  capturedAt: Date;
  lat: number;
  lon: number;
  altitudeM: number | null;
  headingDeg: number | null;
  speedMps: number | null;
  createdAt: Date;
}

/**
 * REQ-7.1/7.2/7.3: persists and reads back a mission's telemetry
 * points against the PostGIS-backed `telemetry_points` table.
 *
 * Uses `$executeRaw`/`$queryRaw` rather than a generated
 * `TelemetryPoint` delegate — same reason as
 * `OutboxRepository`/`ProcessedEventsRepository`/`DetectionsRepository`
 * (schema.prisma's `TelemetryPoint` model comment), with one additional
 * reason specific to this table: Prisma has no native
 * geography/geometry type at all, so `position` is declared
 * `Unsupported(...)` and is *never* available on any generated
 * delegate, in any environment — this repository's raw-SQL approach
 * isn't a workaround for this sandbox's stale-client issue, it's the
 * permanent, correct approach for a PostGIS geography column.
 */
@Injectable()
export class TelemetryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Inserts an ordered batch of points in one transaction — either the
   * whole file's telemetry lands, or none of it does, so a
   * mid-upload failure never leaves a mission with a partial route.
   */
  async insertMany(points: readonly InsertTelemetryInput[]): Promise<void> {
    if (points.length === 0) {
      return;
    }
    await this.prisma.$transaction(
      points.map((point) => this.buildInsertStatement(point)),
    );
  }

  private buildInsertStatement(input: InsertTelemetryInput) {
    return this.prisma.$executeRaw`
      INSERT INTO "telemetry_points" (
        "id", "mission_id", "captured_at", "position",
        "altitude_m", "heading_deg", "speed_mps", "created_at"
      ) VALUES (
        ${randomUUID()},
        ${input.missionId},
        ${input.capturedAt},
        ST_SetSRID(ST_MakePoint(${input.lon}, ${input.lat}), 4326)::geography,
        ${input.altitudeM},
        ${input.headingDeg},
        ${input.speedMps},
        CURRENT_TIMESTAMP
      )
    `;
  }

  /** Ordered by capturedAt so a route/map can render it directly without re-sorting (REQ-7.3). */
  async findByMissionId(missionId: string): Promise<TelemetryRecord[]> {
    const rows = await this.prisma.$queryRaw<TelemetryRow[]>`
      SELECT
        "id",
        "mission_id" AS "missionId",
        "captured_at" AS "capturedAt",
        ST_Y("position"::geometry)::float8 AS "lat",
        ST_X("position"::geometry)::float8 AS "lon",
        "altitude_m" AS "altitudeM",
        "heading_deg" AS "headingDeg",
        "speed_mps" AS "speedMps",
        "created_at" AS "createdAt"
      FROM "telemetry_points"
      WHERE "mission_id" = ${missionId}
      ORDER BY "captured_at" ASC
    `;
    return rows;
  }
}
