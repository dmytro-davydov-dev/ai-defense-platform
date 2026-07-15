import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { PrismaExecutor } from "../prisma/prisma.types";
import type {
  EdgeDeviceRecord,
  RegisterDeviceInput,
} from "./edge-device.types";

type EdgeDeviceRow = EdgeDeviceRecord;

/**
 * Phase 9 (docs/mvp-plan/PRD-Phase-9.md REQ-9.9/9.10): `$queryRaw`/
 * `$executeRaw` against `edge_devices` — same stale-generated-client
 * reason as every repository added since Phase 3 (see schema.prisma's
 * comment on `EdgeDevice`). Never selects `token_hash` into an
 * `EdgeDeviceRecord` — that column is written once at registration and
 * read only by `DeviceAuthGuard`'s own narrower query. Column lists are
 * written out in full in every query (not shared via a string constant)
 * because Prisma's `$queryRaw` tagged template binds `${}` interpolants
 * as parameters, not raw SQL text — a shared "column list" string would
 * be sent as a bound value, not spliced into the query, silently
 * breaking every query that used it.
 */
@Injectable()
export class EdgeDevicesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async insert(
    input: RegisterDeviceInput & { readonly tokenHash: string },
  ): Promise<EdgeDeviceRecord> {
    const id = randomUUID();
    const rows = await this.prisma.$queryRaw<EdgeDeviceRow[]>`
      INSERT INTO "edge_devices" (
        "id", "device_id", "token_hash", "display_name", "created_by_id", "created_at"
      ) VALUES (
        ${id}, ${input.deviceId}, ${input.tokenHash}, ${input.displayName ?? null},
        ${input.createdById ?? null}, CURRENT_TIMESTAMP
      )
      RETURNING
        "id",
        "device_id" AS "deviceId",
        "display_name" AS "displayName",
        "created_by_id" AS "createdById",
        "created_at" AS "createdAt",
        "last_seen_at" AS "lastSeenAt",
        "last_sync_at" AS "lastSyncAt",
        "revoked_at" AS "revokedAt"
    `;
    const row = rows[0];
    if (!row) {
      throw new Error("insert into edge_devices returned no row");
    }
    return row;
  }

  async findAll(): Promise<EdgeDeviceRecord[]> {
    return this.prisma.$queryRaw<EdgeDeviceRow[]>`
      SELECT
        "id",
        "device_id" AS "deviceId",
        "display_name" AS "displayName",
        "created_by_id" AS "createdById",
        "created_at" AS "createdAt",
        "last_seen_at" AS "lastSeenAt",
        "last_sync_at" AS "lastSyncAt",
        "revoked_at" AS "revokedAt"
      FROM "edge_devices"
      ORDER BY "created_at" DESC
    `;
  }

  async findById(id: string): Promise<EdgeDeviceRecord | null> {
    const rows = await this.prisma.$queryRaw<EdgeDeviceRow[]>`
      SELECT
        "id",
        "device_id" AS "deviceId",
        "display_name" AS "displayName",
        "created_by_id" AS "createdById",
        "created_at" AS "createdAt",
        "last_seen_at" AS "lastSeenAt",
        "last_sync_at" AS "lastSyncAt",
        "revoked_at" AS "revokedAt"
      FROM "edge_devices"
      WHERE "id" = ${id}
    `;
    return rows[0] ?? null;
  }

  async findByDeviceId(deviceId: string): Promise<EdgeDeviceRecord | null> {
    const rows = await this.prisma.$queryRaw<EdgeDeviceRow[]>`
      SELECT
        "id",
        "device_id" AS "deviceId",
        "display_name" AS "displayName",
        "created_by_id" AS "createdById",
        "created_at" AS "createdAt",
        "last_seen_at" AS "lastSeenAt",
        "last_sync_at" AS "lastSyncAt",
        "revoked_at" AS "revokedAt"
      FROM "edge_devices"
      WHERE "device_id" = ${deviceId}
    `;
    return rows[0] ?? null;
  }

  async revoke(id: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "edge_devices" SET "revoked_at" = CURRENT_TIMESTAMP WHERE "id" = ${id}
    `;
  }

  /** REQ-9.10/9.11: called by `EdgeEventsService` after a batch of synchronized events is durably persisted — records that this device was seen and successfully synced just now. */
  async touchSync(
    id: string,
    executor: PrismaExecutor = this.prisma,
  ): Promise<void> {
    await executor.$executeRaw`
      UPDATE "edge_devices"
      SET "last_seen_at" = CURRENT_TIMESTAMP, "last_sync_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${id}
    `;
  }

  async runInTransaction<T>(
    fn: (executor: PrismaExecutor) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction((tx) => fn(tx));
  }
}
