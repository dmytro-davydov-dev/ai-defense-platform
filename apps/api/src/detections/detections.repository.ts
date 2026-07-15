import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type {
  DetectionBoundingBoxInput,
  DetectionRecord,
  InsertDetectionInput,
} from "./detection.types";

interface DetectionRow {
  id: string;
  missionId: string;
  frameIndex: number;
  frameTimestampMs: number;
  trackId: number;
  label: string;
  confidence: number;
  boundingBox: DetectionBoundingBoxInput;
  createdAt: Date;
}

/**
 * REQ-6.1/6.2: persists and reads back `DETECTION_PUBLISHED` events.
 *
 * Uses `$executeRaw`/`$queryRaw` against the `detections` table rather
 * than a generated `Detection` delegate — same reason as
 * `OutboxRepository`/`ProcessedEventsRepository` (see schema.prisma's
 * comment): `prisma generate` can't run in this sandbox, so the
 * generated client doesn't know this table exists yet. Regenerating the
 * client would let this move to `this.prisma.detection.create(...)`/
 * `.findMany(...)` without changing the public method signatures below.
 */
@Injectable()
export class DetectionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async insert(input: InsertDetectionInput): Promise<void> {
    const boundingBoxJson = JSON.stringify(input.boundingBox);
    await this.prisma.$executeRaw`
      INSERT INTO "detections" (
        "id", "mission_id", "frame_index", "frame_timestamp_ms",
        "track_id", "label", "confidence", "bounding_box", "created_at"
      ) VALUES (
        ${randomUUID()},
        ${input.missionId},
        ${input.frameIndex},
        ${input.frameTimestampMs},
        ${input.trackId},
        ${input.label},
        ${input.confidence},
        ${boundingBoxJson}::jsonb,
        CURRENT_TIMESTAMP
      )
    `;
  }

  /** Ordered by frameIndex so a video player can play the returned list back in playback order without re-sorting. */
  async findByMissionId(missionId: string): Promise<DetectionRecord[]> {
    const rows = await this.prisma.$queryRaw<DetectionRow[]>`
      SELECT
        "id",
        "mission_id" AS "missionId",
        "frame_index" AS "frameIndex",
        "frame_timestamp_ms" AS "frameTimestampMs",
        "track_id" AS "trackId",
        "label",
        "confidence"::float8 AS "confidence",
        "bounding_box" AS "boundingBox",
        "created_at" AS "createdAt"
      FROM "detections"
      WHERE "mission_id" = ${missionId}
      ORDER BY "frame_index" ASC
    `;
    return rows;
  }
}
