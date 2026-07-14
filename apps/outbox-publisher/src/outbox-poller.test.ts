import { test } from "node:test";
import assert from "node:assert/strict";

import { pollOnce } from "./outbox-poller.js";
import type { DbClient, DbPool, QueryResult } from "./db.js";
import type { KafkaProducerLike } from "./kafka.js";

const baseRow = {
  id: "outbox-1",
  event_id: "event-1",
  aggregate_type: "mission",
  aggregate_id: "mission-1",
  event_type: "MISSION_PROCESSING_REQUESTED",
  payload: { missionId: "mission-1", videoObjectKey: "k" },
  correlation_id: "corr-1",
  causation_id: null,
  created_at: new Date("2026-01-01T00:00:00Z"),
};

function fakePool(rows: (typeof baseRow)[]): { pool: DbPool; queries: string[] } {
  const queries: string[] = [];
  const client: DbClient = {
    query: <T>(text: string): Promise<QueryResult<T>> => {
      queries.push(text.trim().split("\n")[0] ?? text);
      if (text.includes("SELECT")) {
        return Promise.resolve({ rows: rows as unknown as T[] });
      }
      return Promise.resolve({ rows: [] });
    },
    release: () => undefined,
  };
  const pool: DbPool = {
    connect: () => Promise.resolve(client),
    end: () => Promise.resolve(),
  };
  return { pool, queries };
}

interface SentMessage {
  topic: string;
  key: string;
  headers: Record<string, string>;
}

void test("pollOnce publishes each claimed row to Kafka and marks it published", async () => {
  const { pool, queries } = fakePool([baseRow]);
  const sent: SentMessage[] = [];
  const producer: KafkaProducerLike = {
    send: (record) => {
      for (const message of record.messages) {
        sent.push({ topic: record.topic, key: message.key, headers: message.headers });
      }
      return Promise.resolve();
    },
  };

  const count = await pollOnce(pool, producer, 20);

  assert.equal(count, 1);
  assert.equal(sent.length, 1);
  const [message] = sent;
  assert.ok(message);
  assert.equal(message.topic, "aidefense.commands");
  assert.equal(message.key, "mission-1");
  assert.equal(message.headers["correlationId"], "corr-1");
  assert.equal(message.headers["eventId"], "event-1");
  assert.ok(queries.some((q) => q.includes("BEGIN")));
  assert.ok(queries.some((q) => q.includes("COMMIT")));
});

void test("pollOnce rolls back the whole batch if a publish fails", async () => {
  const { pool, queries } = fakePool([baseRow]);
  const producer: KafkaProducerLike = {
    send: () => Promise.reject(new Error("broker unavailable")),
  };

  const count = await pollOnce(pool, producer, 20);

  assert.equal(count, 0);
  assert.ok(queries.some((q) => q.includes("ROLLBACK")));
});

void test("pollOnce is a no-op when there are no unpublished rows", async () => {
  const { pool } = fakePool([]);
  const producer: KafkaProducerLike = {
    send: () => Promise.reject(new Error("should not be called")),
  };

  const count = await pollOnce(pool, producer, 20);
  assert.equal(count, 0);
});
