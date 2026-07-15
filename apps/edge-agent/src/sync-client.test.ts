import { test } from "node:test";
import assert from "node:assert/strict";

import { runSyncCycle } from "./sync-client.js";
import type { BufferedEventRow } from "./event-buffer.js";

const CONFIG = {
  apiBaseUrl: "http://api.test",
  deviceToken: "test-token",
  batchMaxEvents: 50,
  batchMaxBytes: 65_536,
};

function makeRow(overrides: Partial<BufferedEventRow> = {}): BufferedEventRow {
  return {
    rowId: 1,
    eventId: "11111111-1111-1111-1111-111111111111",
    eventType: "DEVICE_HEALTH_REPORTED",
    occurredAt: "2026-07-15T00:00:00.000Z",
    payload: { deviceId: "jetson-01" },
    createdAt: "2026-07-15T00:00:00.000Z",
    syncedAt: null,
    ...overrides,
  };
}

function fakeBuffer(rows: BufferedEventRow[]) {
  const marked: number[] = [];
  return {
    buffer: {
      nextUnsyncedBatch: () => rows,
      markSynced: (rowIds: readonly number[]) => {
        marked.push(...rowIds);
      },
    },
    marked,
  };
}

void test("runSyncCycle is a no-op when the buffer has nothing unsynced", async () => {
  const { buffer, marked } = fakeBuffer([]);
  const fetchImpl = (() => {
    throw new Error("should not be called");
  }) as unknown as typeof fetch;

  const result = await runSyncCycle(buffer, CONFIG, fetchImpl);

  assert.deepEqual(result, { synced: 0, duplicates: 0 });
  assert.equal(marked.length, 0);
});

void test("runSyncCycle POSTs the batch with the device bearer token and marks it synced on success", async () => {
  const row = makeRow();
  const { buffer, marked } = fakeBuffer([row]);
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(
      new Response(JSON.stringify({ accepted: 1, duplicates: 0 }), { status: 200 }),
    );
  }) as unknown as typeof fetch;

  const result = await runSyncCycle(buffer, CONFIG, fetchImpl);

  assert.deepEqual(result, { synced: 1, duplicates: 0 });
  assert.deepEqual(marked, [1]);
  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.ok(call);
  assert.equal(call.url, "http://api.test/edge/events");
  const headers = call.init.headers as Record<string, string>;
  assert.equal(headers["Authorization"], "Bearer test-token");
  const body = JSON.parse(call.init.body as string) as { events: unknown[] };
  assert.equal(body.events.length, 1);
});

void test("runSyncCycle leaves the batch unsynced when the server rejects it", async () => {
  const row = makeRow();
  const { buffer, marked } = fakeBuffer([row]);
  const fetchImpl = (() =>
    Promise.resolve(new Response("bad request", { status: 400 }))) as unknown as typeof fetch;

  const result = await runSyncCycle(buffer, CONFIG, fetchImpl);

  assert.deepEqual(result, { synced: 0, duplicates: 0 });
  assert.equal(marked.length, 0);
});

void test("runSyncCycle leaves the batch unsynced on a network error", async () => {
  const row = makeRow();
  const { buffer, marked } = fakeBuffer([row]);
  const fetchImpl = (() => Promise.reject(new Error("ECONNREFUSED"))) as unknown as typeof fetch;

  const result = await runSyncCycle(buffer, CONFIG, fetchImpl);

  assert.deepEqual(result, { synced: 0, duplicates: 0 });
  assert.equal(marked.length, 0);
});
