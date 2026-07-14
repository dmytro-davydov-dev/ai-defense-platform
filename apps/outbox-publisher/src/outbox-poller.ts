import { log } from "@ai-defense/observability";
import type { DbPool } from "./db.js";
import type { KafkaProducerLike } from "./kafka.js";
import { rowToOutboxRow } from "./outbox-row.js";
import { buildEnvelopeFromOutboxRow, topicForEventType } from "./envelope-builder.js";

const CLAIM_QUERY = `
  SELECT "id", "event_id", "aggregate_type", "aggregate_id", "event_type",
         "payload", "correlation_id", "causation_id", "created_at"
  FROM "outbox"
  WHERE "published_at" IS NULL
  ORDER BY "created_at" ASC
  LIMIT $1
  FOR UPDATE SKIP LOCKED
`;

const MARK_PUBLISHED_QUERY = `
  UPDATE "outbox" SET "published_at" = CURRENT_TIMESTAMP WHERE "id" = $1
`;

/**
 * REQ-3.7: one poll cycle — claims up to `batchSize` unpublished outbox
 * rows, publishes each to Kafka keyed by mission ID (REQ-3.2), and marks
 * the whole batch published in the same DB transaction it claimed them
 * in.
 *
 * The claim + Kafka-publish + mark-published all happen inside one
 * `BEGIN`/`COMMIT`, using `FOR UPDATE SKIP LOCKED` so multiple publisher
 * replicas never claim the same row twice. If any row's Kafka publish
 * throws, the whole batch rolls back — rows already marked published
 * earlier in this same (uncommitted) batch revert to unpublished and
 * get retried next cycle. That can redeliver a row Kafka already
 * received, which is exactly the "at-least-once, not exactly-once"
 * behavior REQ-3.7 documents; REQ-3.8's `processed_events` check on the
 * consumer side is what makes a duplicate delivery safe.
 *
 * @returns the number of rows published this cycle (0 means "nothing to
 * do" or "batch failed" — the caller backs off either way).
 */
export async function pollOnce(
  pool: DbPool,
  producer: KafkaProducerLike,
  batchSize: number,
): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(CLAIM_QUERY, [batchSize]);

    for (const rawRow of rows) {
      const row = rowToOutboxRow(rawRow);
      const envelope = buildEnvelopeFromOutboxRow(row);
      const topic = topicForEventType(row.eventType);

      await producer.send({
        topic,
        messages: [
          {
            key: row.aggregateId,
            value: JSON.stringify(envelope),
            headers: {
              eventId: envelope.eventId,
              eventType: envelope.eventType,
              correlationId: envelope.correlationId,
              causationId: envelope.causationId ?? "",
            },
          },
        ],
      });

      await client.query(MARK_PUBLISHED_QUERY, [row.id]);

      log("info", "outbox row published", {
        eventId: envelope.eventId,
        eventType: envelope.eventType,
        topic,
        aggregateId: row.aggregateId,
        correlationId: envelope.correlationId,
      });
    }

    await client.query("COMMIT");
    return rows.length;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    log("error", "outbox poll batch failed, will retry next cycle", {
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  } finally {
    client.release();
  }
}
