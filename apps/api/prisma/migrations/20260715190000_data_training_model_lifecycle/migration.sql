-- PRD-Phase-8 (docs/mvp-plan/PRD-Phase-8.md) REQ-8.1/8.3/8.7/8.9.
--
-- Hand-written: same reason as every migration in this directory since
-- 20260714120000_kafka_event_platform's migration.sql — `prisma migrate
-- dev`/`prisma migrate diff` could not be run in the sandbox that
-- authored this migration (binaries.prisma.sh is network-blocked here,
-- see docs/roadmap/Progress.md's Known gaps). This SQL was written by
-- hand to match apps/api/prisma/schema.prisma's new Dataset/
-- DatasetSplit/TrainingRun/ModelVersion models, following the same
-- conventions (map/@@map naming, column types) as every prior
-- migration in this directory. Verify with `prisma migrate diff
-- --from-migrations ./prisma/migrations --to-schema-datamodel
-- ./prisma/schema.prisma --shadow-database-url <url> --script` (or just
-- `prisma migrate dev`) on a machine with network access before relying
-- on this in a shared/deployed database, and regenerate the Prisma
-- client (`prisma generate`) afterwards — unlike TelemetryPoint, none
-- of these four tables use an `Unsupported(...)` column, so once
-- `prisma generate` succeeds, DatasetsRepository/TrainingRunsRepository/
-- ModelRegistryRepository could move to the generated delegates without
-- a schema change; they use `$queryRaw`/`$executeRaw` for now purely
-- because of the stale-client limitation documented there.

-- CreateEnum
CREATE TYPE "ModelStage" AS ENUM ('CANDIDATE', 'STAGED', 'PRODUCTION', 'RETIRED');

-- CreateTable
CREATE TABLE "datasets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "storage_location" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "collection_method" TEXT NOT NULL,
    "license" TEXT NOT NULL,
    "provenance_notes" TEXT NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "datasets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "datasets_name_version_key" ON "datasets"("name", "version");

-- CreateTable
CREATE TABLE "dataset_splits" (
    "id" TEXT NOT NULL,
    "dataset_id" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "train_ratio" DOUBLE PRECISION NOT NULL,
    "validation_ratio" DOUBLE PRECISION NOT NULL,
    "test_ratio" DOUBLE PRECISION NOT NULL,
    "train_count" INTEGER NOT NULL,
    "validation_count" INTEGER NOT NULL,
    "test_count" INTEGER NOT NULL,
    "train_manifest_object_key" TEXT NOT NULL,
    "validation_manifest_object_key" TEXT NOT NULL,
    "test_manifest_object_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dataset_splits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dataset_splits_dataset_id_idx" ON "dataset_splits"("dataset_id");

-- AddForeignKey
ALTER TABLE "dataset_splits" ADD CONSTRAINT "dataset_splits_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "training_runs" (
    "id" TEXT NOT NULL,
    "dataset_id" TEXT NOT NULL,
    "dataset_split_id" TEXT NOT NULL,
    "git_commit" TEXT,
    "hyperparameters" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "evaluation_report" JSONB,
    "started_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "training_runs_dataset_id_idx" ON "training_runs"("dataset_id");

-- AddForeignKey
ALTER TABLE "training_runs" ADD CONSTRAINT "training_runs_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_runs" ADD CONSTRAINT "training_runs_dataset_split_id_fkey" FOREIGN KEY ("dataset_split_id") REFERENCES "dataset_splits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "model_versions" (
    "id" TEXT NOT NULL,
    "training_run_id" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "stage" "ModelStage" NOT NULL DEFAULT 'CANDIDATE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promoted_at" TIMESTAMP(3),
    "promoted_by_id" TEXT,

    CONSTRAINT "model_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "model_versions_stage_idx" ON "model_versions"("stage");

-- AddForeignKey
ALTER TABLE "model_versions" ADD CONSTRAINT "model_versions_training_run_id_fkey" FOREIGN KEY ("training_run_id") REFERENCES "training_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
