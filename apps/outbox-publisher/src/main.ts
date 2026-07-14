import { Pool } from "pg";
import { Kafka } from "kafkajs";
import { log } from "@ai-defense/observability";
import { loadConfig } from "./config.js";
import { pollOnce } from "./outbox-poller.js";

/**
 * REQ-3.7: Transactional Outbox publisher. Polls the `outbox` table
 * (written by apps/api's `MissionsService.transition()`, REQ-3.6) and
 * publishes unpublished rows to Kafka. Talks to Postgres directly via
 * `pg` (db.ts) rather than importing apps/api's Prisma schema — this is
 * a separately deployable app (Repository_Structure.md: "apps/ contains
 * deployable applications"), not a library consumer of apps/api.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = new Pool({ connectionString: config.databaseUrl });
  const kafka = new Kafka({
    clientId: "outbox-publisher",
    brokers: config.kafkaBrokers,
  });
  const producer = kafka.producer();
  await producer.connect();

  log("info", "outbox-publisher started", {
    pollIntervalMs: config.pollIntervalMs,
    batchSize: config.batchSize,
  });

  let stopped = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (stopped) {
      return;
    }
    stopped = true;
    log("info", `received ${signal}, shutting down outbox-publisher`);
    await producer.disconnect();
    await pool.end();
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  // `stopped` is mutated by the `shutdown` closure above, invoked
  // asynchronously from a signal handler — eslint's control-flow
  // analysis can't see that from inside this loop body, so it
  // (incorrectly) flags both `stopped` checks below as "always
  // falsy"/"always truthy".
  /* eslint-disable @typescript-eslint/no-unnecessary-condition */
  while (!stopped) {
    let publishedCount = 0;
    try {
      publishedCount = await pollOnce(pool, producer, config.batchSize);
    } catch (error) {
      log("error", "unexpected error in outbox poll loop", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (publishedCount === 0 && !stopped) {
      await sleep(config.pollIntervalMs);
    }
  }
  /* eslint-enable @typescript-eslint/no-unnecessary-condition */
}

void main();
