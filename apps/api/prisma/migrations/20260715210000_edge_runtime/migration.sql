-- PRD-Phase-9 (docs/mvp-plan/PRD-Phase-9.md) REQ-9.9/9.10.
--
-- Hand-written: same reason as every migration in this directory since
-- 20260714120000_kafka_event_platform's migration.sql — `prisma migrate
-- dev`/`prisma migrate diff` could not be run in the sandbox that
-- authored this migration (binaries.prisma.sh is network-blocked here,
-- see docs/roadmap/Progress.md's Known gaps). This SQL was written by
-- hand to match apps/api/prisma/schema.prisma's new EdgeDevice model,
-- following the same conventions (map/@@map naming, column types) as
-- every prior migration in this directory. Verify with `prisma migrate
-- diff --from-migrations ./prisma/migrations --to-schema-datamodel
-- ./prisma/schema.prisma --shadow-database-url <url> --script` (or just
-- `prisma migrate dev`) on a machine with network access before relying
-- on this in a shared/deployed database, and regenerate the Prisma
-- client (`prisma generate`) afterwards — this table uses no
-- `Unsupported(...)` column, so once `prisma generate` succeeds,
-- EdgeDevicesRepository could move to the generated `edgeDevice`
-- delegate without a schema change; it uses `$queryRaw`/`$executeRaw`
-- for now purely because of the stale-client limitation documented
-- there.

-- CreateTable
CREATE TABLE "edge_devices" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "display_name" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3),
    "last_sync_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "edge_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "edge_devices_device_id_key" ON "edge_devices"("device_id");

-- CreateIndex
CREATE UNIQUE INDEX "edge_devices_token_hash_key" ON "edge_devices"("token_hash");
