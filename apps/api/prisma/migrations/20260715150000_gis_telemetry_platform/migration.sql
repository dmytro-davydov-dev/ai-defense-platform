-- PRD-Phase-7 (docs/mvp-plan/PRD-Phase-7.md) REQ-7.1.
--
-- Hand-written: same reason as every prior raw-SQL migration in this
-- directory — `prisma migrate dev`/`prisma migrate diff` could not be
-- run in the sandbox that authored this migration (binaries.prisma.sh
-- is network-blocked here, see docs/roadmap/Progress.md's Known gaps).
-- This SQL was written by hand to match
-- apps/api/prisma/schema.prisma's new TelemetryPoint model. Verify with
-- `prisma migrate diff --from-migrations ./prisma/migrations
-- --to-schema-datamodel ./prisma/schema.prisma --shadow-database-url
-- <url> --script` (or just `prisma migrate dev`) on a machine with
-- network access before relying on this in a shared/deployed database.
--
-- `position` is a real PostGIS `geography(Point, 4326)` column, per
-- docs/decisions/Technology_Decisions.md's PostGIS rationale and
-- docs/adr/ADR-007-map-library-choice.md — not a pair of plain float
-- columns. `TelemetryRepository` writes it via
-- `ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography` and reads it
-- back via `ST_X`/`ST_Y` on `position::geometry`, using
-- `$queryRaw`/`$executeRaw` exclusively — Prisma's generated client has
-- no native geography/geometry type (schema.prisma's `position` field
-- uses `Unsupported(...)` for this reason and is excluded from the
-- generated `TelemetryPoint` delegate regardless of whether
-- `prisma generate` can run in a given environment).
--
-- The `postgis` extension is already enabled by
-- infrastructure/postgres/init/001-enable-postgis.sql before this
-- migration runs.

-- CreateTable
CREATE TABLE "telemetry_points" (
    "id" TEXT NOT NULL,
    "mission_id" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "position" geography(Point, 4326) NOT NULL,
    "altitude_m" DOUBLE PRECISION,
    "heading_deg" DOUBLE PRECISION,
    "speed_mps" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemetry_points_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: mission-scoped, chronological reads (REQ-7.3 always
-- orders by capturedAt within one mission).
CREATE INDEX "telemetry_points_mission_id_captured_at_idx" ON "telemetry_points"("mission_id", "captured_at");

-- CreateIndex: GIST index on the geography column, for the roadmap's
-- deferred full spatial-query scope (docs/mvp-plan/PRD-Phase-7.md
-- Section 4's non-goals) — not exercised by this phase's own
-- endpoints, but cheap to add now and avoids a future migration just
-- to add an index PostGIS is designed around.
CREATE INDEX "telemetry_points_position_idx" ON "telemetry_points" USING GIST ("position");

-- AddForeignKey
ALTER TABLE "telemetry_points" ADD CONSTRAINT "telemetry_points_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "missions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
