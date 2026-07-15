/**
 * Phase 9 (docs/mvp-plan/PRD-Phase-9.md): startup configuration,
 * sourced from environment variables — no secrets hardcoded (REQ-1.18),
 * same pattern as every other service's config loader
 * (`apps/outbox-publisher/src/config.ts`, `apps/api`'s
 * `PrismaService`/`StorageService` guards).
 */
export interface EdgeAgentConfig {
  /** REQ-9.9: this device's human-chosen label — must match the `deviceId` it was registered under via `POST /devices`. */
  readonly deviceId: string;
  /** REQ-9.9: the bearer credential returned once at registration time. */
  readonly deviceToken: string;
  /** Base URL of `apps/api`, e.g. `http://api:3000`. */
  readonly apiBaseUrl: string;
  /** REQ-9.2: local video source the Python sidecar iterates. */
  readonly videoPath: string;
  /** REQ-9.2: restart from the beginning on end-of-stream instead of exiting — the closest this reference implementation gets to a continuous live sensor without one. */
  readonly loopVideo: boolean;
  readonly confidenceThreshold: number | undefined;
  /** REQ-9.3 (docs/adr/ADR-010-edge-runtime-language-and-inference-strategy.md): how to invoke the Python sidecar. */
  readonly pythonExecutable: string;
  readonly visionServiceCwd: string;
  /** REQ-9.5: where the durable SQLite buffer lives on disk. */
  readonly bufferDbPath: string;
  /** REQ-9.8: bounded-storage policy — oldest synced rows are pruned first once either bound is exceeded. */
  readonly bufferMaxRows: number;
  readonly bufferRetentionHours: number;
  /** REQ-9.6: how often the sync client attempts to flush the buffer. */
  readonly syncIntervalMs: number;
  /** REQ-9.16: bandwidth-aware batch caps — whichever limit is hit first ends the batch. */
  readonly syncBatchMaxEvents: number;
  readonly syncBatchMaxBytes: number;
  /** REQ-9.11: how often a device-health snapshot is appended to the buffer. */
  readonly healthReportIntervalMs: number;
  /** REQ-9.13/9.15: how often the edge agent checks for a new production model. */
  readonly modelPollIntervalMs: number;
  readonly modelCachePath: string;
  /** REQ-9.1: `/health`/`/ready` HTTP port. */
  readonly port: number;
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) {
    throw new Error(`${key} must be set (see .env.example)`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): EdgeAgentConfig {
  return {
    deviceId: requireEnv(env, "EDGE_DEVICE_ID"),
    deviceToken: requireEnv(env, "EDGE_DEVICE_TOKEN"),
    apiBaseUrl: requireEnv(env, "EDGE_API_BASE_URL"),
    videoPath: requireEnv(env, "EDGE_VIDEO_PATH"),
    loopVideo: (env["EDGE_LOOP_VIDEO"] ?? "true").toLowerCase() !== "false",
    confidenceThreshold: env["EDGE_CONFIDENCE_THRESHOLD"]
      ? Number(env["EDGE_CONFIDENCE_THRESHOLD"])
      : undefined,
    pythonExecutable: env["EDGE_PYTHON_EXECUTABLE"] ?? "python3",
    visionServiceCwd: env["EDGE_VISION_SERVICE_CWD"] ?? "../vision-service",
    bufferDbPath: env["EDGE_BUFFER_DB_PATH"] ?? "./edge-agent-buffer.sqlite",
    bufferMaxRows: Number(env["EDGE_BUFFER_MAX_ROWS"] ?? 50_000),
    bufferRetentionHours: Number(env["EDGE_BUFFER_RETENTION_HOURS"] ?? 72),
    syncIntervalMs: Number(env["EDGE_SYNC_INTERVAL_MS"] ?? 15_000),
    syncBatchMaxEvents: Number(env["EDGE_SYNC_BATCH_MAX_EVENTS"] ?? 50),
    syncBatchMaxBytes: Number(env["EDGE_SYNC_BATCH_MAX_BYTES"] ?? 65_536),
    healthReportIntervalMs: Number(env["EDGE_HEALTH_REPORT_INTERVAL_MS"] ?? 60_000),
    modelPollIntervalMs: Number(env["EDGE_MODEL_POLL_INTERVAL_MS"] ?? 300_000),
    modelCachePath: env["EDGE_MODEL_CACHE_PATH"] ?? "./edge-agent-model.onnx",
    port: Number(env["PORT"] ?? 8080),
  };
}
