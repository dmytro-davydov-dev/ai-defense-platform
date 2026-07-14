import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import { createEnvelope, ENVELOPE_FIELD_NAMES } from "./envelope";
import {
  DEAD_LETTER_FIELD_NAMES,
  MISSION_PROCESSING_REQUESTED_FIELD_NAMES,
  PROCESSING_COMPLETED_FIELD_NAMES,
  PROCESSING_FAILED_FIELD_NAMES,
  PROCESSING_STARTED_FIELD_NAMES,
} from "./payloads";
import { MISSION_SCOPED_TOPICS, TOPICS } from "./topics";

// Compiled to dist/envelope.test.js (CommonJS, see package.json's `test`
// script) alongside the schemas/ directory, which tsc doesn't copy —
// read it from the source tree via __dirname's compiled-sibling layout.
const schemasDir = join(__dirname, "..", "src", "schemas");

function schemaFieldNames(file: string): string[] {
  const schema = JSON.parse(readFileSync(join(schemasDir, file), "utf-8")) as {
    properties: Record<string, unknown>;
  };
  return Object.keys(schema.properties).sort();
}

void test("createEnvelope produces every envelope field, once", () => {
  const envelope = createEnvelope({
    eventType: "MISSION_PROCESSING_REQUESTED",
    eventVersion: 1,
    producer: "api",
    payload: { missionId: "m-1", videoObjectKey: "k" },
  });
  assert.deepEqual(Object.keys(envelope).sort(), [...ENVELOPE_FIELD_NAMES].sort());
  assert.equal(envelope.causationId, null);
  assert.ok(envelope.eventId.length > 0);
  assert.ok(envelope.correlationId.length > 0);
});

void test("createEnvelope reuses a caller-supplied correlationId/causationId", () => {
  const envelope = createEnvelope({
    eventType: "PROCESSING_STARTED",
    eventVersion: 1,
    producer: "vision-service",
    payload: { missionId: "m-1" },
    correlationId: "corr-1",
    causationId: "cause-1",
  });
  assert.equal(envelope.correlationId, "corr-1");
  assert.equal(envelope.causationId, "cause-1");
});

void test("ENVELOPE_FIELD_NAMES matches event-envelope.schema.json (REQ-3.4)", () => {
  assert.deepEqual(
    [...ENVELOPE_FIELD_NAMES].sort(),
    schemaFieldNames("event-envelope.schema.json"),
  );
});

void test("payload FIELD_NAMES constants match their schema files (REQ-3.4)", () => {
  const cases: [readonly string[], string][] = [
    [MISSION_PROCESSING_REQUESTED_FIELD_NAMES, "mission-processing-requested.schema.json"],
    [PROCESSING_STARTED_FIELD_NAMES, "processing-started.schema.json"],
    [PROCESSING_COMPLETED_FIELD_NAMES, "processing-completed.schema.json"],
    [PROCESSING_FAILED_FIELD_NAMES, "processing-failed.schema.json"],
    [DEAD_LETTER_FIELD_NAMES, "dead-letter.schema.json"],
  ];
  for (const [fieldNames, file] of cases) {
    assert.deepEqual([...fieldNames].sort(), schemaFieldNames(file), file);
  }
});

void test("mission-scoped topics are a subset of TOPICS (REQ-3.1/3.2)", () => {
  const allTopics = Object.values(TOPICS);
  for (const topic of MISSION_SCOPED_TOPICS) {
    assert.ok(allTopics.includes(topic), topic);
  }
});
