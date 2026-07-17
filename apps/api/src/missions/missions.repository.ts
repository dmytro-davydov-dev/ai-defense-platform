import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { PrismaExecutor } from "../prisma/prisma.types";
import type { MissionStatus } from "../../generated/prisma/client";
import type {
  CreateMissionInput,
  MissionRecord,
  UpdateMissionMetadataInput,
} from "./mission.types";

/**
 * Coding_Standards.md: "repositories hide persistence details." The only
 * place mission persistence is touched directly.
 *
 * `findById`/`findAll`/`softDelete` use `$queryRaw`/`$executeRaw` against
 * the `missions` table's `deleted_at` column rather than the generated
 * `mission` delegate's `findUnique`/`findMany`/`update` — same reason as
 * `DetectionsRepository` (see that file's header comment):
 * `prisma generate` can't run in this sandbox, so the generated client
 * predates `deleted_at` (added in migration
 * `20260717120000_mission_soft_delete`) and doesn't select or filter on
 * it. `create`/`updateMetadata`/`updateStatus`/`setVideoObjectKey` are
 * untouched by soft delete (every caller reaches them only after
 * `findById` already excluded deleted missions), so they stay on the
 * generated delegate. Regenerating the client would let `findById`/
 * `findAll` move back to `executor.mission.findUnique(...)`/
 * `.findMany(...)` with a `where: { deletedAt: null }` clause, without
 * changing these methods' public signatures.
 */
@Injectable()
export class MissionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    input: CreateMissionInput,
    executor: PrismaExecutor = this.prisma,
  ): Promise<MissionRecord> {
    return executor.mission.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        createdById: input.createdById,
      },
    });
  }

  async findById(
    id: string,
    executor: PrismaExecutor = this.prisma,
  ): Promise<MissionRecord | null> {
    const rows = await executor.$queryRaw<MissionRecord[]>`
      SELECT
        "id",
        "title",
        "description",
        "status",
        "video_object_key" AS "videoObjectKey",
        "created_by_id" AS "createdById",
        "created_at" AS "createdAt",
        "updated_at" AS "updatedAt"
      FROM "missions"
      WHERE "id" = ${id} AND "deleted_at" IS NULL
    `;
    return rows[0] ?? null;
  }

  async findAll(
    executor: PrismaExecutor = this.prisma,
  ): Promise<MissionRecord[]> {
    return executor.$queryRaw<MissionRecord[]>`
      SELECT
        "id",
        "title",
        "description",
        "status",
        "video_object_key" AS "videoObjectKey",
        "created_by_id" AS "createdById",
        "created_at" AS "createdAt",
        "updated_at" AS "updatedAt"
      FROM "missions"
      WHERE "deleted_at" IS NULL
      ORDER BY "created_at" DESC
    `;
  }

  /**
   * Soft delete only — see schema.prisma's `Mission.deletedAt` comment
   * for why a hard DELETE isn't viable here. The `deleted_at IS NULL`
   * guard makes this idempotent: calling it twice on an already-deleted
   * mission is a harmless no-op (zero rows affected the second time),
   * matching `updateStatus`'s check-then-write posture one layer up in
   * `MissionsService.deleteMission`.
   */
  async softDelete(
    id: string,
    executor: PrismaExecutor = this.prisma,
  ): Promise<void> {
    await executor.$executeRaw`
      UPDATE "missions"
      SET "deleted_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${id} AND "deleted_at" IS NULL
    `;
  }

  async updateMetadata(
    id: string,
    input: UpdateMissionMetadataInput,
    executor: PrismaExecutor = this.prisma,
  ): Promise<MissionRecord> {
    return executor.mission.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
      },
    });
  }

  async updateStatus(
    id: string,
    status: MissionStatus,
    executor: PrismaExecutor = this.prisma,
  ): Promise<MissionRecord> {
    return executor.mission.update({ where: { id }, data: { status } });
  }

  async setVideoObjectKey(
    id: string,
    videoObjectKey: string,
    executor: PrismaExecutor = this.prisma,
  ): Promise<MissionRecord> {
    return executor.mission.update({ where: { id }, data: { videoObjectKey } });
  }
}
