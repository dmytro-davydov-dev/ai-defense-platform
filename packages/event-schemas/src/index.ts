/**
 * @ai-defense/event-schemas
 *
 * Scaffold only — Phase 1 (docs/mvp-plan/PRD-Phase-1.md, REQ-1.10).
 * Populated in Phase 3 with the JSON Schema event envelope and per-topic
 * payload schemas (aidefense.commands, aidefense.processing-events,
 * aidefense.detections, aidefense.telemetry, aidefense.audit,
 * aidefense.device-events, aidefense.dead-letter), plus generated TS
 * types and a matching Python/Pydantic model, per
 * docs/architecture/Coding_Standards.md's event envelope shape:
 *
 * { eventId, eventType, eventVersion, occurredAt, correlationId,
 *   causationId, producer, payload }
 */

/**
 * Placeholder marker type. Replace with the real event envelope + topic
 * payload types in Phase 3.
 */
export interface EventSchemasPackagePlaceholder {
  readonly phase: 1;
  readonly note: "populated in Phase 3 — see docs/mvp-plan/PRD-Phase-1.md REQ-1.10";
}

export const EVENT_SCHEMAS_PACKAGE_VERSION = "0.1.0" as const;
