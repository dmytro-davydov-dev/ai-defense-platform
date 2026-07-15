import { test } from "node:test";
import assert from "node:assert/strict";

import { EdgeEventBuffer } from "./event-buffer.js";

function makeEvent(overrides: Partial<{ eventId: string; payload: Record<string, unknown> }> = {}) {
  return {
    eventId: overrides.eventId ?? "11111111-1111-1111-1111-111111111111",
    eventType: "DEVICE_HEALTH_REPORTED",
    occurredAt: "2026-07-15T00:00:00.000Z",
    payload: overrides.payload ?? { deviceId: "jetson-01", bufferDepth: 0 },
  };
}

void test("append + nextUnsyncedBatch: a newly appended event is returned unsynced", () => {
  const buffer = new EdgeEventBuffer(":memory:");
  try {
    buffer.append(makeEvent());
    assert.equal(buffer.countUnsynced(), 1);

    const batch = buffer.nextUnsyncedBatch(10, 65_536);
    assert.equal(batch.length, 1);
    const [row] = batch;
    assert.ok(row);
    assert.equal(row.eventId, "11111111-1111-1111-1111-111111111111");
    assert.deepEqual(row.payload, { deviceId: "jetson-01", bufferDepth: 0 });
  } finally {
    buffer.close();
  }
});

void test("REQ-9.7: append is idempotent on eventId — no duplicate row", () => {
  const buffer = new EdgeEventBuffer(":memory:");
  try {
    buffer.append(makeEvent());
    buffer.append(makeEvent());
    assert.equal(buffer.countUnsynced(), 1);
  } finally {
    buffer.close();
  }
});

void test("markSynced removes rows from the unsynced count and future batches", () => {
  const buffer = new EdgeEventBuffer(":memory:");
  try {
    buffer.append(makeEvent({ eventId: "11111111-1111-1111-1111-111111111111" }));
    buffer.append(makeEvent({ eventId: "22222222-2222-2222-2222-222222222222" }));

    const batch = buffer.nextUnsyncedBatch(10, 65_536);
    assert.equal(batch.length, 2);
    buffer.markSynced(batch.map((row) => row.rowId));

    assert.equal(buffer.countUnsynced(), 0);
    assert.equal(buffer.nextUnsyncedBatch(10, 65_536).length, 0);
  } finally {
    buffer.close();
  }
});

void test("REQ-9.16: nextUnsyncedBatch stops adding rows once the byte cap would be exceeded", () => {
  const buffer = new EdgeEventBuffer(":memory:");
  try {
    const bigPayload = { blob: "x".repeat(100) };
    buffer.append(
      makeEvent({ eventId: "11111111-1111-1111-1111-111111111111", payload: bigPayload }),
    );
    buffer.append(
      makeEvent({ eventId: "22222222-2222-2222-2222-222222222222", payload: bigPayload }),
    );
    buffer.append(
      makeEvent({ eventId: "33333333-3333-3333-3333-333333333333", payload: bigPayload }),
    );

    // Each payload serializes to well over 100 bytes; capping at 150
    // bytes should admit exactly one row per batch (the "always at
    // least one row" guarantee), not zero.
    const batch = buffer.nextUnsyncedBatch(10, 150);
    assert.equal(batch.length, 1);
  } finally {
    buffer.close();
  }
});

void test("REQ-9.16: nextUnsyncedBatch respects the maxEvents cap even with plenty of byte budget", () => {
  const buffer = new EdgeEventBuffer(":memory:");
  try {
    for (let i = 0; i < 5; i += 1) {
      buffer.append(makeEvent({ eventId: `1111111${i}-1111-1111-1111-111111111111` }));
    }
    const batch = buffer.nextUnsyncedBatch(2, 65_536);
    assert.equal(batch.length, 2);
  } finally {
    buffer.close();
  }
});

void test("REQ-9.8: prune deletes synced rows once the row cap is exceeded, oldest first, and never touches unsynced rows", () => {
  const buffer = new EdgeEventBuffer(":memory:");
  try {
    for (let i = 0; i < 5; i += 1) {
      buffer.append(makeEvent({ eventId: `1111111${i}-1111-1111-1111-111111111111` }));
    }
    const [first, second] = buffer.nextUnsyncedBatch(2, 65_536);
    assert.ok(first && second);
    buffer.markSynced([first.rowId, second.rowId]);

    // 5 total rows (2 synced, 3 unsynced), cap at 3 — must delete the
    // 2 synced rows to get under the cap, and cannot touch the 3
    // unsynced ones even though that leaves the table over cap.
    const deleted = buffer.prune(3, 999);
    assert.equal(deleted, 2);
    assert.equal(buffer.countUnsynced(), 3);
  } finally {
    buffer.close();
  }
});
