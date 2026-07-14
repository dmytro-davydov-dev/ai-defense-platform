import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { PrismaExecutor } from "../prisma/prisma.types";
import type { CreateOutboxRowInput } from "./outbox.types";

/**
 * REQ-3.6: writes one outbox row per command, in the same DB
 * transaction as the mission-state update that triggers it
 * (Coding_Standards.md: "repositories hide persistence details").
 *
 * Uses `$executeRaw` against the `outbox` table's event_id/
 * correlation_id/causation_id columns (added this phase) rather than
 * the generated `Outbox` delegate — see schema.prisma's comment on why
 * the generated client is stale in this sandbox (prisma generate is
 * network-blocked here). Regenerating the client would let this move to
 * `executor.outbox.create(...)` without changing the public method
 * signature below.
 */
@Injectable()
export class OutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** @returns the generated `eventId` for this row. */
  async insert(
    input: CreateOutboxRowInput,
    executor: PrismaExecutor = this.prisma,
  ): Promise<string> {
    const eventId = randomUUID();
    const payloadJson = JSON.stringify(input.payload);

    await executor.$executeRaw`
      INSERT INTO "outbox" (
        "id", "event_id", "aggregate_type", "aggregate_id", "event_type",
        "payload", "correlation_id", "causation_id", "created_at"
      ) VALUES (
        ${eventId},
        ${eventId},
        ${input.aggregateType},
        ${input.aggregateId},
        ${input.eventType},
        ${payloadJson}::jsonb,
        ${input.correlationId ?? null},
        ${input.causationId ?? null},
        CURRENT_TIMESTAMP
      )
    `;

    return eventId;
  }
}
