import { randomUUID } from "node:crypto";
import { log } from "@ai-defense/observability";
import { EVENT_TYPES } from "@ai-defense/event-schemas";
import { loadConfig } from "./config.js";
import { EdgeEventBuffer } from "./event-buffer.js";
import { computeHealthSnapshot } from "./health-reporter.js";
import { startHealthServer, type HealthState } from "./health-http-server.js";
import { PythonSidecarProcess, type SidecarDetectionEvent } from "./python-sidecar.js";
import { resolveAndDownloadProductionModel } from "./model-resolver.js";
import { runSyncCycle } from "./sync-client.js";

/**
 * REQ-9.1-9.16 (docs/mvp-plan/PRD-Phase-9.md): the real
 * `apps/edge-agent` process, replacing the Phase 1 no-op stub. Wires
 * together the durable local buffer (REQ-9.5), the Python detection
 * sidecar (REQ-9.3, docs/adr/ADR-010-edge-runtime-language-and-inference-strategy.md),
 * model resolution/download (REQ-9.13/9.15), the store-and-forward sync
 * loop (REQ-9.6/9.7), device-health reporting (REQ-9.11), and the
 * bounded-storage prune policy (REQ-9.8). Everything else in this
 * module is orchestration; the interesting logic lives in the small,
 * independently-unit-tested modules it imports.
 */
const SIDECAR_RESTART_BACKOFF_MS = 5_000;
const PRUNE_INTERVAL_MS = 60 * 60 * 1000; // hourly — independent of the configured retention window itself

async function main(): Promise<void> {
  const config = loadConfig();
  const startedAtMs = Date.now();
  const buffer = new EdgeEventBuffer(config.bufferDbPath);
  const healthState: HealthState = { sidecarReady: false };
  const healthServer = startHealthServer(config.port, healthState);

  log("info", "edge agent starting", {
    deviceId: config.deviceId,
    apiBaseUrl: config.apiBaseUrl,
    videoPath: config.videoPath,
    loopVideo: config.loopVideo,
  });

  let stopping = false;
  let sidecar: PythonSidecarProcess | undefined;
  let currentModelPath: string | undefined;
  let lastSuccessfulSyncAt: string | null = null;

  function onDetection(event: SidecarDetectionEvent): void {
    // REQ-9.3/9.5: buffered locally for retention/inspection — not
    // synchronized to the central platform in this pass. See
    // event-buffer.ts's appendLocalOnly() docstring for why (edge
    // detections aren't mission-scoped, so they don't fit the existing
    // `detections` table's NOT NULL mission foreign key without a
    // schema decision docs/mvp-plan/PRD-Phase-9.md deliberately left
    // open).
    buffer.appendLocalOnly({
      eventId: randomUUID(),
      eventType: "EDGE_DETECTION_LOCAL",
      occurredAt: new Date().toISOString(),
      payload: event as unknown as Record<string, unknown>,
    });
  }

  function startSidecar(): void {
    if (stopping) {
      return;
    }
    sidecar = new PythonSidecarProcess({
      pythonExecutable: config.pythonExecutable,
      cwd: config.visionServiceCwd,
      videoPath: config.videoPath,
      loop: config.loopVideo,
      confidenceThreshold: config.confidenceThreshold,
      modelPath: currentModelPath,
      onDetection,
      onReady: () => {
        healthState.sidecarReady = true;
        log("info", "edge sidecar ready");
      },
      onExit: (code) => {
        healthState.sidecarReady = false;
        if (!stopping) {
          log("warn", "edge sidecar exited unexpectedly, restarting after backoff", { code });
          setTimeout(startSidecar, SIDECAR_RESTART_BACKOFF_MS);
        }
      },
    });
    sidecar.start();
  }

  async function checkForModelUpdate(): Promise<void> {
    try {
      const resolved = await resolveAndDownloadProductionModel({
        apiBaseUrl: config.apiBaseUrl,
        deviceToken: config.deviceToken,
        modelCachePath: config.modelCachePath,
      });
      if (resolved && resolved.localPath !== currentModelPath) {
        log("info", "edge agent: new production model resolved, restarting sidecar", {
          modelVersionId: resolved.modelVersionId,
        });
        currentModelPath = resolved.localPath;
        // The sidecar restarts itself via its onExit handler above,
        // picking up the already-updated currentModelPath by the time
        // it does.
        sidecar?.stop();
      }
    } catch (error) {
      log("warn", "edge agent: model resolution failed, keeping the current model", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function runHealthReportCycle(): void {
    const bufferDepth = buffer.countUnsynced();
    const snapshot = computeHealthSnapshot({
      deviceId: config.deviceId,
      bufferDepth,
      lastSyncAt: lastSuccessfulSyncAt,
      startedAtMs,
    });
    buffer.append({
      eventId: randomUUID(),
      eventType: EVENT_TYPES.DEVICE_HEALTH_REPORTED,
      occurredAt: snapshot.reportedAt,
      payload: snapshot as unknown as Record<string, unknown>,
    });
  }

  async function runSync(): Promise<void> {
    try {
      const result = await runSyncCycle(buffer, {
        apiBaseUrl: config.apiBaseUrl,
        deviceToken: config.deviceToken,
        batchMaxEvents: config.syncBatchMaxEvents,
        batchMaxBytes: config.syncBatchMaxBytes,
      });
      if (result.synced > 0 || result.duplicates > 0) {
        lastSuccessfulSyncAt = new Date().toISOString();
      }
    } catch (error) {
      log("error", "edge agent: unexpected error in sync cycle", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function runPrune(): void {
    const deleted = buffer.prune(config.bufferMaxRows, config.bufferRetentionHours);
    if (deleted > 0) {
      log("info", "edge agent: pruned buffered rows", { deleted });
    }
  }

  await checkForModelUpdate();
  startSidecar();

  const syncInterval = setInterval(() => void runSync(), config.syncIntervalMs);
  const healthInterval = setInterval(runHealthReportCycle, config.healthReportIntervalMs);
  const modelPollInterval = setInterval(
    () => void checkForModelUpdate(),
    config.modelPollIntervalMs,
  );
  const pruneInterval = setInterval(runPrune, PRUNE_INTERVAL_MS);

  const shutdown = (signal: string): void => {
    if (stopping) {
      return;
    }
    stopping = true;
    log("info", `received ${signal}, shutting down edge agent`);
    clearInterval(syncInterval);
    clearInterval(healthInterval);
    clearInterval(modelPollInterval);
    clearInterval(pruneInterval);
    sidecar?.stop();
    healthServer.close();
    buffer.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => {
    shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    shutdown("SIGINT");
  });
}

void main();
