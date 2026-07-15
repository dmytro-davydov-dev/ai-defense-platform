import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type {
  RecordTrainingRunInput,
  TrainingRunRecord,
} from "./training-run.types";

interface TrainingRunRow {
  id: string;
  datasetId: string;
  datasetSplitId: string;
  gitCommit: string | null;
  hyperparameters: Record<string, unknown>;
  status: string;
  metrics: Record<string, unknown>;
  evaluationReport: TrainingRunRecord["evaluationReport"];
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
}

/**
 * PRD-Phase-8 REQ-8.7: `$executeRaw`/`$queryRaw` against `training_runs`
 * — same stale-generated-client reason as every repository added since
 * Phase 3 (see schema.prisma's `TrainingRun` model comment).
 */
@Injectable()
export class TrainingRunsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async insert(input: RecordTrainingRunInput): Promise<TrainingRunRecord> {
    const id = randomUUID();
    const hyperparametersJson = JSON.stringify(input.hyperparameters);
    const metricsJson = JSON.stringify(input.metrics);
    const evaluationReportJson =
      input.evaluationReport != null
        ? JSON.stringify(input.evaluationReport)
        : null;

    const rows = await this.prisma.$queryRaw<TrainingRunRow[]>`
      INSERT INTO "training_runs" (
        "id", "dataset_id", "dataset_split_id", "git_commit",
        "hyperparameters", "status", "metrics", "evaluation_report",
        "started_at", "completed_at", "created_at"
      ) VALUES (
        ${id},
        ${input.datasetId},
        ${input.datasetSplitId},
        ${input.gitCommit ?? null},
        ${hyperparametersJson}::jsonb,
        ${input.status},
        ${metricsJson}::jsonb,
        ${evaluationReportJson}::jsonb,
        ${input.startedAt},
        ${input.completedAt ?? null},
        CURRENT_TIMESTAMP
      )
      RETURNING
        "id",
        "dataset_id" AS "datasetId",
        "dataset_split_id" AS "datasetSplitId",
        "git_commit" AS "gitCommit",
        "hyperparameters",
        "status",
        "metrics",
        "evaluation_report" AS "evaluationReport",
        "started_at" AS "startedAt",
        "completed_at" AS "completedAt",
        "created_at" AS "createdAt"
    `;
    const row = rows[0];
    if (!row) {
      throw new Error("insert into training_runs returned no row");
    }
    return toRecord(row);
  }

  async findAll(datasetId?: string): Promise<TrainingRunRecord[]> {
    const rows = datasetId
      ? await this.prisma.$queryRaw<TrainingRunRow[]>`
          SELECT
            "id",
            "dataset_id" AS "datasetId",
            "dataset_split_id" AS "datasetSplitId",
            "git_commit" AS "gitCommit",
            "hyperparameters",
            "status",
            "metrics",
            "evaluation_report" AS "evaluationReport",
            "started_at" AS "startedAt",
            "completed_at" AS "completedAt",
            "created_at" AS "createdAt"
          FROM "training_runs"
          WHERE "dataset_id" = ${datasetId}
          ORDER BY "created_at" DESC
        `
      : await this.prisma.$queryRaw<TrainingRunRow[]>`
          SELECT
            "id",
            "dataset_id" AS "datasetId",
            "dataset_split_id" AS "datasetSplitId",
            "git_commit" AS "gitCommit",
            "hyperparameters",
            "status",
            "metrics",
            "evaluation_report" AS "evaluationReport",
            "started_at" AS "startedAt",
            "completed_at" AS "completedAt",
            "created_at" AS "createdAt"
          FROM "training_runs"
          ORDER BY "created_at" DESC
        `;
    return rows.map(toRecord);
  }

  async findById(id: string): Promise<TrainingRunRecord | null> {
    const rows = await this.prisma.$queryRaw<TrainingRunRow[]>`
      SELECT
        "id",
        "dataset_id" AS "datasetId",
        "dataset_split_id" AS "datasetSplitId",
        "git_commit" AS "gitCommit",
        "hyperparameters",
        "status",
        "metrics",
        "evaluation_report" AS "evaluationReport",
        "started_at" AS "startedAt",
        "completed_at" AS "completedAt",
        "created_at" AS "createdAt"
      FROM "training_runs"
      WHERE "id" = ${id}
    `;
    const row = rows[0];
    return row ? toRecord(row) : null;
  }
}

function toRecord(row: TrainingRunRow): TrainingRunRecord {
  return {
    ...row,
    status: row.status as TrainingRunRecord["status"],
  };
}
