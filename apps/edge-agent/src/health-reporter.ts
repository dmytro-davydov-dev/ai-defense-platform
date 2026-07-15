import type { DeviceHealthReportedPayload } from "@ai-defense/event-schemas";

/** REQ-9.11: a buffer depth at/above this is reported "degraded" — a simple, documented threshold, not a machine-diagnosed value (see the payload's own field description in packages/event-schemas). */
export const DEFAULT_DEGRADED_BUFFER_DEPTH_THRESHOLD = 500;

export interface HealthSnapshotInput {
  readonly deviceId: string;
  readonly bufferDepth: number;
  readonly lastSyncAt: string | null;
  /** Epoch ms the edge agent process started at. */
  readonly startedAtMs: number;
  /** Epoch ms "now" — injectable for deterministic tests. */
  readonly nowMs?: number;
  readonly degradedBufferDepthThreshold?: number;
}

/**
 * REQ-9.11: a pure function computing one `DeviceHealthReportedPayload`
 * snapshot — kept free of any I/O (buffer/HTTP) so it's trivially unit
 * testable, mirroring `apps/api`'s `split.util.ts`/
 * `mission-state-machine.ts` "pure domain logic, separated from its
 * infrastructure callers" convention (Coding_Standards.md).
 */
export function computeHealthSnapshot(input: HealthSnapshotInput): DeviceHealthReportedPayload {
  const now = input.nowMs ?? Date.now();
  const uptimeSeconds = Math.max(0, (now - input.startedAtMs) / 1000);
  const threshold = input.degradedBufferDepthThreshold ?? DEFAULT_DEGRADED_BUFFER_DEPTH_THRESHOLD;

  return {
    deviceId: input.deviceId,
    reportedAt: new Date(now).toISOString(),
    bufferDepth: input.bufferDepth,
    lastSyncAt: input.lastSyncAt,
    uptimeSeconds,
    status: input.bufferDepth >= threshold ? "degraded" : "ok",
  };
}
