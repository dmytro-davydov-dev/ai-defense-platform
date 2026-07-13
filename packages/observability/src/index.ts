/**
 * @ai-defense/observability
 *
 * Stub — Phase 1 (docs/mvp-plan/PRD-Phase-1.md, REQ-1.12). Provides the
 * minimum "Observability baseline" every service needs from Phase 1
 * onward per docs/mvp-plan/MVP_Implementation_Plan.md's cross-cutting
 * concerns: structured JSON logs and correlation-ID propagation. Full
 * OpenTelemetry tracing/metrics wiring lands incrementally; the full
 * dashboard/tracing-backend stack remains Phase 11.
 */

export type LogFields = Record<string, unknown>;

export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Minimal structured JSON logger. Every log line is a single JSON object
 * with a stable shape, so it is machine-parseable from day one. Replace
 * the transport (currently console) with an OpenTelemetry-backed logger
 * without changing call sites, when that lands later in Phase 1+.
 */
export function log(level: LogLevel, message: string, fields: LogFields = {}): void {
  const record = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...fields,
  };
  const line = JSON.stringify(record);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/**
 * Correlation-ID header name used across HTTP and Kafka contexts, per
 * docs/architecture/Coding_Standards.md's event envelope
 * (`correlationId`). Middleware/interceptors added in later phases read
 * and propagate this constant rather than hardcoding the header name.
 */
export const CORRELATION_ID_HEADER = "x-correlation-id" as const;

export const OBSERVABILITY_PACKAGE_VERSION = "0.1.0" as const;
