/**
 * Minimal surface this package needs from `pg`'s `Pool`/`PoolClient` —
 * kept as a narrow interface so `outbox-poller.spec.ts` can inject a
 * fake without spinning up a real Postgres connection (Coding_Standards.md:
 * "integration tests for persistence and Kafka adapters" covers the
 * real thing; this is the unit-testable seam).
 */
export interface QueryResult<T> {
  readonly rows: T[];
}

export interface DbClient {
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
  release(): void;
}

export interface DbPool {
  connect(): Promise<DbClient>;
  end(): Promise<void>;
}
