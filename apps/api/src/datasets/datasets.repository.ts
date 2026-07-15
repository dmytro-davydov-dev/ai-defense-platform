import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type {
  DatasetRecord,
  DatasetSplitRecord,
  InsertDatasetSplitInput,
  RegisterDatasetInput,
} from "./dataset.types";

/**
 * PRD-Phase-8 REQ-8.1/8.3: uses `$executeRaw`/`$queryRaw` against the
 * `datasets`/`dataset_splits` tables rather than generated delegates —
 * same reason as `DetectionsRepository`/`TelemetryRepository`: `prisma
 * generate` can't run in this sandbox, so the generated client is stale
 * and doesn't know these tables exist yet. Unlike `TelemetryPoint`,
 * neither table here needs an `Unsupported(...)` column, so once
 * `prisma generate` succeeds elsewhere, this could move to
 * `this.prisma.dataset.create(...)`/`.findMany(...)` without changing
 * the public method signatures below.
 */
@Injectable()
export class DatasetsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async insert(input: RegisterDatasetInput): Promise<DatasetRecord> {
    const id = randomUUID();
    const rows = await this.prisma.$queryRaw<DatasetRow[]>`
      INSERT INTO "datasets" (
        "id", "name", "version", "storage_location", "source",
        "collection_method", "license", "provenance_notes",
        "created_by_id", "created_at", "updated_at"
      ) VALUES (
        ${id},
        ${input.name},
        ${input.version},
        ${input.storageLocation},
        ${input.source},
        ${input.collectionMethod},
        ${input.license},
        ${input.provenanceNotes},
        ${input.createdById ?? null},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      RETURNING
        "id", "name", "version",
        "storage_location" AS "storageLocation",
        "source",
        "collection_method" AS "collectionMethod",
        "license",
        "provenance_notes" AS "provenanceNotes",
        "created_by_id" AS "createdById",
        "created_at" AS "createdAt",
        "updated_at" AS "updatedAt"
    `;
    const row = rows[0];
    if (!row) {
      throw new Error("insert into datasets returned no row");
    }
    return row;
  }

  async findAll(): Promise<DatasetRecord[]> {
    return this.prisma.$queryRaw<DatasetRow[]>`
      SELECT
        "id", "name", "version",
        "storage_location" AS "storageLocation",
        "source",
        "collection_method" AS "collectionMethod",
        "license",
        "provenance_notes" AS "provenanceNotes",
        "created_by_id" AS "createdById",
        "created_at" AS "createdAt",
        "updated_at" AS "updatedAt"
      FROM "datasets"
      ORDER BY "created_at" DESC
    `;
  }

  async findById(id: string): Promise<DatasetRecord | null> {
    const rows = await this.prisma.$queryRaw<DatasetRow[]>`
      SELECT
        "id", "name", "version",
        "storage_location" AS "storageLocation",
        "source",
        "collection_method" AS "collectionMethod",
        "license",
        "provenance_notes" AS "provenanceNotes",
        "created_by_id" AS "createdById",
        "created_at" AS "createdAt",
        "updated_at" AS "updatedAt"
      FROM "datasets"
      WHERE "id" = ${id}
    `;
    return rows[0] ?? null;
  }

  async insertSplit(
    input: InsertDatasetSplitInput,
  ): Promise<DatasetSplitRecord> {
    const id = randomUUID();
    const rows = await this.prisma.$queryRaw<DatasetSplitRow[]>`
      INSERT INTO "dataset_splits" (
        "id", "dataset_id", "seed", "train_ratio", "validation_ratio",
        "test_ratio", "train_count", "validation_count", "test_count",
        "train_manifest_object_key", "validation_manifest_object_key",
        "test_manifest_object_key", "created_at"
      ) VALUES (
        ${id},
        ${input.datasetId},
        ${input.seed},
        ${input.trainRatio},
        ${input.validationRatio},
        ${input.testRatio},
        ${input.trainCount},
        ${input.validationCount},
        ${input.testCount},
        ${input.trainManifestObjectKey},
        ${input.validationManifestObjectKey},
        ${input.testManifestObjectKey},
        CURRENT_TIMESTAMP
      )
      RETURNING
        "id",
        "dataset_id" AS "datasetId",
        "seed",
        "train_ratio"::float8 AS "trainRatio",
        "validation_ratio"::float8 AS "validationRatio",
        "test_ratio"::float8 AS "testRatio",
        "train_count" AS "trainCount",
        "validation_count" AS "validationCount",
        "test_count" AS "testCount",
        "train_manifest_object_key" AS "trainManifestObjectKey",
        "validation_manifest_object_key" AS "validationManifestObjectKey",
        "test_manifest_object_key" AS "testManifestObjectKey",
        "created_at" AS "createdAt"
    `;
    const row = rows[0];
    if (!row) {
      throw new Error("insert into dataset_splits returned no row");
    }
    return row;
  }

  async findSplitById(id: string): Promise<DatasetSplitRecord | null> {
    const rows = await this.prisma.$queryRaw<DatasetSplitRow[]>`
      SELECT
        "id",
        "dataset_id" AS "datasetId",
        "seed",
        "train_ratio"::float8 AS "trainRatio",
        "validation_ratio"::float8 AS "validationRatio",
        "test_ratio"::float8 AS "testRatio",
        "train_count" AS "trainCount",
        "validation_count" AS "validationCount",
        "test_count" AS "testCount",
        "train_manifest_object_key" AS "trainManifestObjectKey",
        "validation_manifest_object_key" AS "validationManifestObjectKey",
        "test_manifest_object_key" AS "testManifestObjectKey",
        "created_at" AS "createdAt"
      FROM "dataset_splits"
      WHERE "id" = ${id}
    `;
    return rows[0] ?? null;
  }
}

type DatasetRow = DatasetRecord;
type DatasetSplitRow = DatasetSplitRecord;
