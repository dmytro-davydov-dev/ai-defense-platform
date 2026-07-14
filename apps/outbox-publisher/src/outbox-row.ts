/** One row of the `outbox` table (apps/api/prisma/schema.prisma's `Outbox` model). */
export interface OutboxRow {
  readonly id: string;
  readonly eventId: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly payload: unknown;
  readonly correlationId: string | null;
  readonly causationId: string | null;
  readonly createdAt: Date;
}

/** Maps a raw `pg` row (snake_case columns) onto {@link OutboxRow}. */
export function rowToOutboxRow(row: Record<string, unknown>): OutboxRow {
  return {
    id: row["id"] as string,
    eventId: row["event_id"] as string,
    aggregateType: row["aggregate_type"] as string,
    aggregateId: row["aggregate_id"] as string,
    eventType: row["event_type"] as string,
    payload: row["payload"],
    correlationId: (row["correlation_id"] as string | null) ?? null,
    causationId: (row["causation_id"] as string | null) ?? null,
    createdAt: row["created_at"] as Date,
  };
}
