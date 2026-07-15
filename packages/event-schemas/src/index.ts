/**
 * @ai-defense/event-schemas
 *
 * Phase 3 (docs/mvp-plan/PRD-Phase-3.md, REQ-3.1-3.4): the Kafka topic
 * taxonomy, the event envelope, and per-eventType payload types shared
 * between apps/api, apps/outbox-publisher and apps/vision-service.
 * JSON Schema source of truth lives in src/schemas/*.schema.json;
 * apps/vision-service/tests/test_event_schema_sync.py enforces that
 * this package's TS types stay in sync with both the schema files and
 * apps/vision-service's Pydantic models (REQ-3.4). Versioning policy:
 * docs/adr/ADR-005-event-schema-versioning.md.
 */

export * from "./topics";
export * from "./envelope";
export * from "./payloads";

export const EVENT_SCHEMAS_PACKAGE_VERSION = "0.3.0" as const;
