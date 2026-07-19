import { Injectable, InternalServerErrorException } from "@nestjs/common";
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
 * `findById`/`findAll`/`softDelete`/`archive`/`unarchive` use
 * `$queryRaw`/`$executeRaw` against the `missions` table's `deleted_at`/
 * `archived_at` columns rather than the generated `mission` delegate —
 * same reason as `DetectionsRepository`/`ModelRegistryRepository` (see
 * either file's header comment): `prisma generate` can't run in this
 * sandbox, so the generated client predates `deleted_at`
 * (`20260717120000_mission_soft_delete`) and `archived_at`
 * (`20260717150000_mission_archive`) and can neither select nor filter
 * on them. `create`/`updateMetadata`/`updateStatus`/`setVideoObjectKey`
 * still write through the generated delegate (its typed `data` object is
 * safer than hand-rolling `UPDATE`/`INSERT` SQL, especially
 * `updateMetadata`'s conditional-field semantics), then re-read the row
 * via `findById` to return a fully-populated `MissionRecord` — including
 * `archivedAt`, which the generated delegate's return value can't carry
 * since it doesn't know that column exists. One extra `SELECT` per write
 * is a deliberate simplicity-over-cleverness trade (Guiding_Principles.md),
 * not a hot path. Regenerating the client would let every method here
 * move back to `executor.mission.*` with a `where: { deletedAt: null }`
 * clause, without changing any public method signature.
 */
@Injectable()
export class MissionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    input: CreateMissionInput,
    executor: PrismaExecutor = this.prisma,
  ): Promise<MissionRecord> {
    const created = await executor.mission.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        createdById: input.createdById,
      },
    });
    return this.mustFindById(created.id, executor);
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
        "updated_at" AS "updatedAt",
        "archived_at" AS "archivedAt"
      FROM "missions"
      WHERE "id" = ${id} AND "deleted_at" IS NULL
    `;
    return rows[0] ?? null;
  }

  /**
   * `includeArchived` (default `false` at the service layer) controls
   * whether archived missions (`archived_at IS NOT NULL`) are included
   * — `GET /missions` defaults to hiding them so a working list doesn't
   * fill up with missions an operator has already dealt with, while
   * `?includeArchived=true` still finds them (archiving never deletes
   * anything). `deleted_at IS NULL` is unconditional either way: a
   * soft-deleted mission has no view where it comes back.
   */
  async findAll(
    includeArchived: boolean,
    executor: PrismaExecutor = this.prisma,
  ): Promise<MissionRecord[]> {
    if (includeArchived) {
      return executor.$queryRaw<MissionRecord[]>`
        SELECT
          "id",
          "title",
          "description",
          "status",
          "video_object_key" AS "videoObjectKey",
          "created_by_id" AS "createdById",
          "created_at" AS "createdAt",
          "updated_at" AS "updatedAt",
          "archived_at" AS "archivedAt"
        FROM "missions"
        WHERE "deleted_at" IS NULL
        ORDER BY "created_at" DESC
      `;
    }
    return executor.$queryRaw<MissionRecord[]>`
      SELECT
        "id",
        "title",
        "description",
        "status",
        "video_object_key" AS "videoObjectKey",
        "created_by_id" AS "createdById",
        "created_at" AS "createdAt",
        "updated_at" AS "updatedAt",
        "archived_at" AS "archivedAt"
      FROM "missions"
      WHERE "deleted_at" IS NULL AND "archived_at" IS NULL
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

  /**
   * Orthogonal to `status` and to `deletedAt` — see schema.prisma's
   * `Mission.archivedAt` comment. Idempotent, same shape as
   * `softDelete`.
   */
  async archive(
    id: string,
    executor: PrismaExecutor = this.prisma,
  ): Promise<void> {
    await executor.$executeRaw`
      UPDATE "missions"
      SET "archived_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${id} AND "archived_at" IS NULL
    `;
  }

  /** Reverses `archive()`. Idempotent the same way. */
  async unarchive(
    id: string,
    executor: PrismaExecutor = this.prisma,
  ): Promise<void> {
    await executor.$executeRaw`
      UPDATE "missions"
      SET "archived_at" = NULL
      WHERE "id" = ${id} AND "archived_at" IS NOT NULL
    `;
  }

  async updateMetadata(
    id: string,
    input: UpdateMissionMetadataInput,
    executor: PrismaExecutor = this.prisma,
  ): Promise<MissionRecord> {
    await executor.mission.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
      },
    });
    return this.mustFindById(id, executor);
  }

  async updateStatus(
    id: string,
    status: MissionStatus,
    executor: PrismaExecutor = this.prisma,
  ): Promise<MissionRecord> {
    await executor.mission.update({ where: { id }, data: { status } });
    return this.mustFindById(id, executor);
  }

  async setVideoObjectKey(
    id: string,
    videoObjectKey: string,
    executor: PrismaExecutor = this.prisma,
  ): Promise<MissionRecord> {
    await executor.mission.update({
      where: { id },
      data: { videoObjectKey },
    });
    return this.mustFindById(id, executor);
  }

  /** Every write method above calls this immediately after its own update/insert, so a missing row here means the row vanished between the write and this re-read (should be unreachable in practice) rather than a normal "not found" the caller should handle gracefully — hence throwing instead of returning `null`. */
  private async mustFindById(
    id: string,
    executor: PrismaExecutor,
  ): Promise<MissionRecord> {
    const mission = await this.findById(id, executor);
    if (!mission) {
      throw new InternalServerErrorException(
        `mission ${id} not found immediately after a write`,
      );
    }
    return mission;
  }
}
