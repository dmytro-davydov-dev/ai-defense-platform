import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { PrismaExecutor } from "../prisma/prisma.types";
import type {
  ModelStage,
  ModelVersionRecord,
  RegisterModelInput,
} from "./model-registry.types";

type ModelVersionRow = ModelVersionRecord;

/**
 * PRD-Phase-8 REQ-8.9-8.12: `$executeRaw`/`$queryRaw` against
 * `model_versions` — same stale-generated-client reason as every
 * repository added since Phase 3. `promote`/`demoteFromProduction`
 * accept an optional `PrismaExecutor` so `ModelRegistryService.promote()`
 * can run "demote the current production model" and "promote the
 * target model" atomically inside one `prisma.$transaction`, the same
 * shape `MissionsService.transition()` already uses for REQ-2.8.
 */
@Injectable()
export class ModelRegistryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async insert(input: RegisterModelInput): Promise<ModelVersionRecord> {
    const id = randomUUID();
    const rows = await this.prisma.$queryRaw<ModelVersionRow[]>`
      INSERT INTO "model_versions" (
        "id", "training_run_id", "object_key", "stage", "created_at"
      ) VALUES (
        ${id}, ${input.trainingRunId}, ${input.objectKey}, 'CANDIDATE', CURRENT_TIMESTAMP
      )
      RETURNING
        "id",
        "training_run_id" AS "trainingRunId",
        "object_key" AS "objectKey",
        "stage",
        "created_at" AS "createdAt",
        "promoted_at" AS "promotedAt",
        "promoted_by_id" AS "promotedById"
    `;
    const row = rows[0];
    if (!row) {
      throw new Error("insert into model_versions returned no row");
    }
    return row;
  }

  async findAll(): Promise<ModelVersionRecord[]> {
    return this.prisma.$queryRaw<ModelVersionRow[]>`
      SELECT
        "id",
        "training_run_id" AS "trainingRunId",
        "object_key" AS "objectKey",
        "stage",
        "created_at" AS "createdAt",
        "promoted_at" AS "promotedAt",
        "promoted_by_id" AS "promotedById"
      FROM "model_versions"
      ORDER BY "created_at" DESC
    `;
  }

  async findById(
    id: string,
    executor: PrismaExecutor = this.prisma,
  ): Promise<ModelVersionRecord | null> {
    const rows = await executor.$queryRaw<ModelVersionRow[]>`
      SELECT
        "id",
        "training_run_id" AS "trainingRunId",
        "object_key" AS "objectKey",
        "stage",
        "created_at" AS "createdAt",
        "promoted_at" AS "promotedAt",
        "promoted_by_id" AS "promotedById"
      FROM "model_versions"
      WHERE "id" = ${id}
    `;
    return rows[0] ?? null;
  }

  /** REQ-8.10/8.11: the single row currently in PRODUCTION, if any — at most one by construction (every `promote` call demotes the previous one first, in the same transaction). */
  async findProduction(
    executor: PrismaExecutor = this.prisma,
  ): Promise<ModelVersionRecord | null> {
    const rows = await executor.$queryRaw<ModelVersionRow[]>`
      SELECT
        "id",
        "training_run_id" AS "trainingRunId",
        "object_key" AS "objectKey",
        "stage",
        "created_at" AS "createdAt",
        "promoted_at" AS "promotedAt",
        "promoted_by_id" AS "promotedById"
      FROM "model_versions"
      WHERE "stage" = 'PRODUCTION'
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  /**
   * REQ-8.11: the most recently demoted former-production model —
   * `stage = STAGED` (demoted, not retired) and `promoted_at IS NOT
   * NULL` (it was production at least once), ordered by `promoted_at`
   * descending so the first row is "whatever was production immediately
   * before the current one." This is the automatic rollback target when
   * `POST /models/rollback` is called with no explicit target version.
   */
  async findMostRecentlyDemotedProduction(
    excludeId: string | null,
    executor: PrismaExecutor = this.prisma,
  ): Promise<ModelVersionRecord | null> {
    const rows = await executor.$queryRaw<ModelVersionRow[]>`
      SELECT
        "id",
        "training_run_id" AS "trainingRunId",
        "object_key" AS "objectKey",
        "stage",
        "created_at" AS "createdAt",
        "promoted_at" AS "promotedAt",
        "promoted_by_id" AS "promotedById"
      FROM "model_versions"
      WHERE "stage" = 'STAGED'
        AND "promoted_at" IS NOT NULL
        AND (${excludeId}::text IS NULL OR "id" != ${excludeId})
      ORDER BY "promoted_at" DESC
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async setStage(
    id: string,
    stage: ModelStage,
    promotion: { promotedAt: Date; promotedById: string | null } | null,
    executor: PrismaExecutor = this.prisma,
  ): Promise<void> {
    if (promotion) {
      await executor.$executeRaw`
        UPDATE "model_versions"
        SET "stage" = ${stage}::"ModelStage",
            "promoted_at" = ${promotion.promotedAt},
            "promoted_by_id" = ${promotion.promotedById}
        WHERE "id" = ${id}
      `;
    } else {
      await executor.$executeRaw`
        UPDATE "model_versions"
        SET "stage" = ${stage}::"ModelStage"
        WHERE "id" = ${id}
      `;
    }
  }

  async runInTransaction<T>(
    fn: (executor: PrismaExecutor) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction((tx) => fn(tx));
  }
}
