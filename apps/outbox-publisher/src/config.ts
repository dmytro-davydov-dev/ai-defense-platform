/**
 * REQ-3.7: startup configuration, sourced from environment variables —
 * no secrets hardcoded (PRD-Phase-1 REQ-1.18), same pattern as
 * apps/api's PrismaService/StorageService guards.
 */
export interface OutboxPublisherConfig {
  readonly databaseUrl: string;
  readonly kafkaBrokers: string[];
  readonly pollIntervalMs: number;
  readonly batchSize: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): OutboxPublisherConfig {
  const databaseUrl = env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set (see .env.example)");
  }
  const kafkaBrokersRaw = env["KAFKA_BROKERS"];
  if (!kafkaBrokersRaw) {
    throw new Error("KAFKA_BROKERS must be set (see .env.example)");
  }

  return {
    databaseUrl,
    kafkaBrokers: kafkaBrokersRaw.split(",").map((broker) => broker.trim()),
    pollIntervalMs: Number(env["OUTBOX_POLL_INTERVAL_MS"] ?? 1000),
    batchSize: Number(env["OUTBOX_BATCH_SIZE"] ?? 20),
  };
}
