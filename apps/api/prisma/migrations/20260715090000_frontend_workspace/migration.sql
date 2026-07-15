-- PRD-Phase-6 (docs/mvp-plan/PRD-Phase-6.md) REQ-6.1.
--
-- Hand-written: same reason as 20260714120000_kafka_event_platform's
-- migration.sql — `prisma migrate dev`/`prisma migrate diff` could not
-- be run in the sandbox that authored this migration
-- (binaries.prisma.sh is network-blocked here, see
-- docs/roadmap/Progress.md's Known gaps). This SQL was written by hand
-- to match apps/api/prisma/schema.prisma's new Detection model,
-- following the same conventions (map/@@map naming, column types) as
-- every prior migration in this directory. Verify with `prisma migrate
-- diff --from-migrations ./prisma/migrations --to-schema-datamodel
-- ./prisma/schema.prisma --shadow-database-url <url> --script` (or just
-- `prisma migrate dev`) on a machine with network access before relying
-- on this in a shared/deployed database, and regenerate the Prisma
-- client (`prisma generate`) afterwards — DetectionsRepository
-- intentionally uses `$queryRaw`/`$executeRaw` instead of a generated
-- delegate so it doesn't depend on that regeneration happening first.

-- CreateTable
CREATE TABLE "detections" (
    "id" TEXT NOT NULL,
    "mission_id" TEXT NOT NULL,
    "frame_index" INTEGER NOT NULL,
    "frame_timestamp_ms" INTEGER NOT NULL,
    "track_id" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "bounding_box" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "detections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "detections_mission_id_idx" ON "detections"("mission_id");

-- AddForeignKey
ALTER TABLE "detections" ADD CONSTRAINT "detections_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "missions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
