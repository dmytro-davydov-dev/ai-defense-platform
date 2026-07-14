import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * REQ-3.8: idempotent consumption. `markProcessed` is the only
 * operation this needs — an `INSERT ... ON CONFLICT DO NOTHING` against
 * the `(event_id, consumer)` unique index (see the
 * `20260714120000_kafka_event_platform` migration) is itself the
 * check-and-record: 0 rows affected means some earlier call already
 * processed this `eventId` for this `consumer`, so the caller must skip
 * the side effect.
 *
 * Uses `$queryRaw` against the `processed_events` table rather than a
 * generated `ProcessedEvent` delegate for the same reason
 * `OutboxRepository` does — see schema.prisma's comment.
 */
@Injectable()
export class ProcessedEventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** @returns true if this call recorded the event for the first time; false if it was already processed. */
  async markProcessed(eventId: string, consumer: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO "processed_events" ("id", "event_id", "consumer", "processed_at")
      VALUES (${randomUUID()}, ${eventId}, ${consumer}, CURRENT_TIMESTAMP)
      ON CONFLICT ("event_id", "consumer") DO NOTHING
      RETURNING "id"
    `;
    return rows.length > 0;
  }
}
