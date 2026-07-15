import { DatabaseSync } from "node:sqlite";

/**
 * REQ-9.5/9.7/9.8/9.16 (docs/mvp-plan/PRD-Phase-9.md): a durable,
 * append-only local event buffer backed by `node:sqlite` — chosen over
 * a native package like `better-sqlite3` specifically to add zero new
 * native/network-fetched dependencies (this platform's Node version,
 * pinned to >=22.13.0, ships `node:sqlite` as an experimental built-in
 * behind the `--experimental-sqlite` CLI flag, no `npm install` or
 * prebuilt-binary download required) — the same "avoid a
 * network-fetched native dependency in a restricted sandbox" reasoning
 * docs/adr/ADR-006-detection-model-and-tracker.md already used to
 * reject ByteTrack/BoT-SORT in favor of an in-house tracker.
 *
 * `eventId` is unique — `append()` is safe to call again with the same
 * `eventId` (e.g. after a crash mid-write) without creating a
 * duplicate row, mirroring `processed_events`' `ON CONFLICT DO
 * NOTHING` idempotency on the `apps/api` side (REQ-9.7).
 */
export interface BufferedEvent {
  readonly eventId: string;
  readonly eventType: string;
  readonly occurredAt: string;
  readonly payload: Record<string, unknown>;
}

export interface BufferedEventRow extends BufferedEvent {
  readonly rowId: number;
  readonly createdAt: string;
  readonly syncedAt: string | null;
}

interface RawRow {
  row_id: number;
  event_id: string;
  event_type: string;
  occurred_at: string;
  payload: string;
  created_at: string;
  synced_at: string | null;
}

function toBufferedEventRow(row: RawRow): BufferedEventRow {
  return {
    rowId: row.row_id,
    eventId: row.event_id,
    eventType: row.event_type,
    occurredAt: row.occurred_at,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    createdAt: row.created_at,
    syncedAt: row.synced_at,
  };
}

export class EdgeEventBuffer {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS edge_events (
        row_id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        event_type TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        synced_at TEXT
      )
    `);
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_edge_events_unsynced ON edge_events (synced_at, row_id)`,
    );
  }

  /** REQ-9.5/9.7: idempotent on `eventId` — a redelivered append (e.g. the health reporter retrying after a crash before this call returned) is a no-op, not a duplicate row. */
  append(event: BufferedEvent): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO edge_events (event_id, event_type, occurred_at, payload)
         VALUES (?, ?, ?, ?)`,
      )
      .run(event.eventId, event.eventType, event.occurredAt, JSON.stringify(event.payload));
  }

  /**
   * REQ-9.3/9.5: for events this pass never synchronizes to the
   * central platform (edge-produced detections — see
   * docs/mvp-plan/PRD-Phase-9.md Section 11's open question on
   * `aidefense.device-events`'s read side and
   * docs/roadmap/Progress.md's Phase 9 Known gaps for why: they aren't
   * mission-scoped, so they don't fit the existing `detections`
   * table's `NOT NULL` mission foreign key without a schema decision
   * this phase deliberately left open). Inserted already-"synced" so
   * they're durably retained (subject to `prune()`'s bounded-storage
   * policy, same as everything else) but `nextUnsyncedBatch()` never
   * picks them up — a real local buffer, not a discarded event.
   */
  appendLocalOnly(event: BufferedEvent): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO edge_events (event_id, event_type, occurred_at, payload, synced_at)
         VALUES (?, ?, ?, ?, datetime('now'))`,
      )
      .run(event.eventId, event.eventType, event.occurredAt, JSON.stringify(event.payload));
  }

  /** REQ-9.11: buffer depth — the number of rows not yet confirmed synced. */
  countUnsynced(): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS count FROM edge_events WHERE synced_at IS NULL`)
      .get() as { count: number } | undefined;
    return row?.count ?? 0;
  }

  /**
   * REQ-9.16: the next batch to synchronize, oldest first, capped by
   * both row count and cumulative serialized-payload byte size —
   * whichever limit is hit first ends the batch. Always returns at
   * least one row (if any are unsynced) even if that single row alone
   * exceeds `maxBytes`, so an oversized event can't permanently stall
   * synchronization.
   */
  nextUnsyncedBatch(maxEvents: number, maxBytes: number): BufferedEventRow[] {
    const candidates = this.db
      .prepare(
        `SELECT row_id, event_id, event_type, occurred_at, payload, created_at, synced_at
         FROM edge_events
         WHERE synced_at IS NULL
         ORDER BY row_id ASC
         LIMIT ?`,
      )
      .all(maxEvents) as unknown as RawRow[];

    const batch: BufferedEventRow[] = [];
    let totalBytes = 0;
    for (const raw of candidates) {
      const rowBytes = Buffer.byteLength(raw.payload, "utf8");
      if (batch.length > 0 && totalBytes + rowBytes > maxBytes) {
        break;
      }
      batch.push(toBufferedEventRow(raw));
      totalBytes += rowBytes;
    }
    return batch;
  }

  /** REQ-9.6/9.7: marks a batch as durably confirmed synced — only ever called after `apps/api` has acknowledged receipt. */
  markSynced(rowIds: readonly number[]): void {
    if (rowIds.length === 0) {
      return;
    }
    const placeholders = rowIds.map(() => "?").join(", ");
    this.db
      .prepare(
        `UPDATE edge_events SET synced_at = datetime('now') WHERE row_id IN (${placeholders})`,
      )
      .run(...rowIds);
  }

  /**
   * REQ-9.8: bounded-storage/backpressure policy. Deletes synced rows
   * older than `retentionHours` first; if the table is still over
   * `maxRows` afterward, deletes the oldest remaining *synced* rows
   * (never unsynced ones) until it fits. An unsynced backlog that alone
   * exceeds `maxRows` is left alone — this policy never discards data
   * that hasn't reached the central platform yet, only data that
   * already has.
   *
   * @returns the number of rows deleted.
   */
  prune(maxRows: number, retentionHours: number): number {
    let deleted = 0;

    const ageResult = this.db
      .prepare(
        `DELETE FROM edge_events
         WHERE synced_at IS NOT NULL
           AND synced_at < datetime('now', ? || ' hours')`,
      )
      .run(`-${retentionHours}`);
    deleted += Number(ageResult.changes);

    const totalRow = this.db.prepare(`SELECT COUNT(*) AS count FROM edge_events`).get() as
      { count: number } | undefined;
    const total = totalRow?.count ?? 0;
    if (total > maxRows) {
      const overflow = total - maxRows;
      const overflowResult = this.db
        .prepare(
          `DELETE FROM edge_events
           WHERE row_id IN (
             SELECT row_id FROM edge_events
             WHERE synced_at IS NOT NULL
             ORDER BY row_id ASC
             LIMIT ?
           )`,
        )
        .run(overflow);
      deleted += Number(overflowResult.changes);
    }

    return deleted;
  }

  close(): void {
    this.db.close();
  }
}
