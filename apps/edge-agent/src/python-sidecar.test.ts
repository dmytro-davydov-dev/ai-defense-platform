import { test } from "node:test";
import assert from "node:assert/strict";

import { parseSidecarLine } from "./python-sidecar.js";

void test("parseSidecarLine: recognizes a ready line", () => {
  assert.deepEqual(parseSidecarLine(JSON.stringify({ type: "ready" })), { kind: "ready" });
});

void test("parseSidecarLine: recognizes a detection line and preserves its fields", () => {
  const detectionRecord = {
    type: "detection",
    frameIndex: 3,
    frameTimestampMs: 750,
    trackId: 1,
    label: "person",
    confidence: 0.91,
    boundingBox: { x: 1, y: 2, width: 3, height: 4 },
  };

  const parsed = parseSidecarLine(JSON.stringify(detectionRecord));

  assert.equal(parsed.kind, "detection");
  assert.deepEqual(parsed.event, detectionRecord);
});

void test("parseSidecarLine: recognizes an error line and extracts its message", () => {
  const parsed = parseSidecarLine(
    JSON.stringify({ type: "error", message: "could not open video" }),
  );
  assert.deepEqual(parsed, { kind: "error", message: "could not open video" });
});

void test("parseSidecarLine: ignores a blank line rather than throwing", () => {
  assert.equal(parseSidecarLine("").kind, "ignored");
  assert.equal(parseSidecarLine("   ").kind, "ignored");
});

void test("parseSidecarLine: ignores malformed JSON rather than throwing", () => {
  assert.equal(parseSidecarLine("not-json-at-all").kind, "ignored");
});

void test("parseSidecarLine: ignores an object with no type field", () => {
  assert.equal(parseSidecarLine(JSON.stringify({ frameIndex: 0 })).kind, "ignored");
});

void test("parseSidecarLine: ignores an unrecognized type", () => {
  assert.equal(parseSidecarLine(JSON.stringify({ type: "something-new" })).kind, "ignored");
});
