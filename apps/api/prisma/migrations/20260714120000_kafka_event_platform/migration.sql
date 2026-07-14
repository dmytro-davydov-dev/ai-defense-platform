-- PRD-Phase-3 (docs/mvp-plan/PRD-Phase-3.md) REQ-3.6/3.7/3.8/3.11.
--
-- Hand-written: `prisma migrate dev`/`prisma migrate diff` could not be
-- run in the sandbox that authored this migration (binaries.prisma.sh is
-- network-blocked here, same gap as the initial migration/generated
-- client — see docs/roadmap/Progress.md's Known gaps). This SQL was
-- written to match apps/api/prisma/schema.prisma's Outbox/ProcessedEvent
-- models by hand, following the same conventions (map/@@map naming,
-- column types) as the committed 20260714093811_init migration. Verify
-- with `prisma migrate diff --from-migrations ./prisma/migrations
-- --to-schema-datamodel ./prisma/schema.prisma --shadow-database-url
-- <url> --script` (or just `prisma migrate dev`) on a machine with
-- network access before relying on this in a shared/deployed database,
-- and regenerate the Prisma client (`prisma generate`) afterwards — the
-- Outbox/ProcessedEvent repositories in this phase intentionally use
-- `$queryRaw`/`$executeRaw` instead of the generated delegate so they
-- don't depend on that regeneration happening first.
--
-- Assumes the `outbox` table has never been written to (true as of
-- Phase 2 — "columns only, nothing reads it") so adding `event_id` as
-- NOT NULL with no default is safe; if a target database already has
-- outbox rows, backfill `event_id` before running this migration.

-- AlterTable
ALTER TABLE "outbox" ADD COLUMN "event_id" TEXT NOT NULL;
ALTER TABLE "outbox" ADD COLUMN "correlation_id" TEXT;
ALTER TABLE "outbox" ADD COLUMN "causation_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "outbox_event_id_key" ON "outbox"("event_id");

-- CreateTable
CREATE TABLE "processed_events" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "consumer" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "processed_events_event_id_consumer_key" ON "processed_events"("event_id", "consumer");
