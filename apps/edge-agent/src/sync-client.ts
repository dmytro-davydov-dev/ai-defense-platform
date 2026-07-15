import { randomUUID } from "node:crypto";
import { log, CORRELATION_ID_HEADER } from "@ai-defense/observability";
import type { BufferedEventRow, EdgeEventBuffer } from "./event-buffer.js";

export interface SyncClientConfig {
  readonly apiBaseUrl: string;
  readonly deviceToken: string;
  readonly batchMaxEvents: number;
  readonly batchMaxBytes: number;
}

export interface SyncResult {
  readonly synced: number;
  readonly duplicates: number;
}

/** Minimal surface this module needs from the global `fetch` — injectable for tests, same seam `apps/outbox-publisher`'s `KafkaProducerLike` uses for its own external dependency. */
export type FetchLike = typeof fetch;

interface IngestResponseBody {
  readonly accepted: number;
  readonly duplicates: number;
}

/**
 * REQ-9.6/9.7/9.9/9.16 (docs/mvp-plan/PRD-Phase-9.md,
 * docs/adr/ADR-011-device-identity-and-sync-transport.md): one
 * store-and-forward synchronization cycle. Pulls the next
 * bandwidth-aware batch from the local buffer (`EdgeEventBuffer`
 * already applies REQ-9.16's size caps), POSTs it to
 * `apps/api`'s `POST /edge/events` with this device's bearer token, and
 * marks the whole batch synced only after the server confirms receipt
 * — a failed request leaves every row unsynced, so the same batch (or
 * a natural superset/subset of it, depending on what else was
 * appended meanwhile) is retried on the next cycle. Nothing here is
 * lost on a network interruption; nothing here can be
 * double-committed on the server either (REQ-9.7's idempotency lives
 * server-side, in `EdgeEventsService`).
 */
export async function runSyncCycle(
  buffer: Pick<EdgeEventBuffer, "nextUnsyncedBatch" | "markSynced">,
  config: SyncClientConfig,
  fetchImpl: FetchLike = fetch,
): Promise<SyncResult> {
  const batch: BufferedEventRow[] = buffer.nextUnsyncedBatch(
    config.batchMaxEvents,
    config.batchMaxBytes,
  );
  if (batch.length === 0) {
    return { synced: 0, duplicates: 0 };
  }

  const correlationId = randomUUID();
  const base = config.apiBaseUrl.replace(/\/$/, "");

  let response: Response;
  try {
    response = await fetchImpl(`${base}/edge/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.deviceToken}`,
        [CORRELATION_ID_HEADER]: correlationId,
      },
      body: JSON.stringify({
        events: batch.map((row) => ({
          eventId: row.eventId,
          eventType: row.eventType,
          occurredAt: row.occurredAt,
          payload: row.payload,
        })),
      }),
    });
  } catch (error) {
    log("warn", "edge agent: sync request failed (network error), will retry next cycle", {
      error: error instanceof Error ? error.message : String(error),
      correlationId,
    });
    return { synced: 0, duplicates: 0 };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    log("warn", "edge agent: sync batch rejected, will retry next cycle", {
      status: response.status,
      body: body.slice(0, 500),
      correlationId,
    });
    return { synced: 0, duplicates: 0 };
  }

  const result = (await response.json()) as IngestResponseBody;
  // The whole batch is confirmed handled (accepted OR recognized as an
  // already-processed duplicate) once the server returns 200 — either
  // way, this device never needs to resend it.
  buffer.markSynced(batch.map((row) => row.rowId));

  log("info", "edge agent: sync batch confirmed", {
    accepted: result.accepted,
    duplicates: result.duplicates,
    batchSize: batch.length,
    correlationId,
  });
  return { synced: result.accepted, duplicates: result.duplicates };
}
