import { test } from "node:test";
import assert from "node:assert/strict";

import { computeHealthSnapshot } from "./health-reporter.js";

void test("computeHealthSnapshot reports ok status and derived uptime under the degraded threshold", () => {
  const snapshot = computeHealthSnapshot({
    deviceId: "jetson-01",
    bufferDepth: 3,
    lastSyncAt: "2026-07-15T00:00:00.000Z",
    startedAtMs: 0,
    nowMs: 120_000,
  });

  assert.equal(snapshot.deviceId, "jetson-01");
  assert.equal(snapshot.bufferDepth, 3);
  assert.equal(snapshot.lastSyncAt, "2026-07-15T00:00:00.000Z");
  assert.equal(snapshot.uptimeSeconds, 120);
  assert.equal(snapshot.status, "ok");
  assert.equal(snapshot.reportedAt, new Date(120_000).toISOString());
});

void test("computeHealthSnapshot reports degraded at/above the buffer-depth threshold", () => {
  const atThreshold = computeHealthSnapshot({
    deviceId: "jetson-01",
    bufferDepth: 500,
    lastSyncAt: null,
    startedAtMs: 0,
    nowMs: 1000,
    degradedBufferDepthThreshold: 500,
  });
  assert.equal(atThreshold.status, "degraded");

  const belowThreshold = computeHealthSnapshot({
    deviceId: "jetson-01",
    bufferDepth: 499,
    lastSyncAt: null,
    startedAtMs: 0,
    nowMs: 1000,
    degradedBufferDepthThreshold: 500,
  });
  assert.equal(belowThreshold.status, "ok");
});

void test("computeHealthSnapshot reports lastSyncAt: null for a device that has never synced", () => {
  const snapshot = computeHealthSnapshot({
    deviceId: "jetson-01",
    bufferDepth: 0,
    lastSyncAt: null,
    startedAtMs: 0,
    nowMs: 1000,
  });
  assert.equal(snapshot.lastSyncAt, null);
});
