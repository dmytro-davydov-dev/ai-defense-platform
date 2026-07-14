import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { Kafka, type Consumer, type Producer } from "kafkajs";
import { Client as PgClient } from "pg";
import { TOPICS } from "@ai-defense/event-schemas";
import type {
  DeadLetterPayload,
  EventEnvelope,
} from "@ai-defense/event-schemas";
import { PrismaModule } from "../src/prisma/prisma.module";
import { MissionsModule } from "../src/missions/missions.module";
import { MissionsService } from "../src/missions/missions.service";
import { ProcessedEventsModule } from "../src/processed-events/processed-events.module";
import { ProcessedEventsRepository } from "../src/processed-events/processed-events.repository";
import {
  handleProcessingEventMessage,
  type ProcessingEventsHandlerDeps,
} from "../src/kafka/processing-events.handler";
import { MissionStatus } from "../generated/prisma/client";

/**
 * REQ-3.15: integration tests against the Compose-provided Redpanda and
 * Postgres (and, transitively, MinIO — `MissionsModule` pulls in
 * `StorageModule`, whose `onModuleInit` does a real bucket check).
 *
 * Requires a running local stack:
 *   docker compose -f infrastructure/compose/docker-compose.yml up -d postgres redpanda kafka-init minio
 * with `DATABASE_URL`, `KAFKA_BROKERS`, `MINIO_ROOT_USER`,
 * `MINIO_ROOT_PASSWORD` exported to match (see `.env.example`).
 *
 * Not runnable in this sandbox — no docker daemon is available here (the
 * same, already-documented limitation as REQ-2.14's integration tests;
 * see docs/roadmap/Progress.md Known gaps). This file is real,
 * executable test code, written and reviewed but not yet run — running
 * it end-to-end and wiring a CI job for it is the next step on a
 * machine with docker.
 */
const DATABASE_URL = process.env["DATABASE_URL"];
const KAFKA_BROKERS = process.env["KAFKA_BROKERS"];
const MINIO_READY = Boolean(
  process.env["MINIO_ROOT_USER"] && process.env["MINIO_ROOT_PASSWORD"],
);
const INTEGRATION_READY = Boolean(DATABASE_URL && KAFKA_BROKERS && MINIO_READY);

if (!INTEGRATION_READY) {
  console.warn(
    "Skipping apps/api Kafka event platform e2e tests (REQ-3.15): set " +
      "DATABASE_URL, KAFKA_BROKERS, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD " +
      "against a running `docker compose up postgres redpanda kafka-init minio` " +
      "stack to run them. Not runnable in this sandbox — see " +
      "docs/roadmap/Progress.md Known gaps.",
  );
}

/** Fails the test loudly if the DLQ path is reached when it shouldn't be. */
const unusedDlqProducer: ProcessingEventsHandlerDeps["dlqProducer"] = {
  send: () => {
    throw new Error(
      "dlqProducer.send should not be called in this test — the transition was expected to succeed",
    );
  },
};

async function waitFor(
  predicate: () => boolean,
  timeoutMs: number,
  pollIntervalMs = 50,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`waitFor: condition not met within ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

(INTEGRATION_READY ? describe : describe.skip)(
  "Kafka event platform (e2e, REQ-3.15)",
  () => {
    let app: INestApplication;
    let missionsService: MissionsService;
    let processedEventsRepository: ProcessedEventsRepository;
    let pgClient: PgClient;
    let kafka: Kafka;
    let dlqProducer: Producer;
    const createdUserIds: string[] = [];
    const createdMissionIds: string[] = [];

    beforeAll(async () => {
      pgClient = new PgClient({ connectionString: DATABASE_URL });
      await pgClient.connect();

      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [PrismaModule, MissionsModule, ProcessedEventsModule],
      }).compile();
      app = moduleFixture.createNestApplication();
      await app.init();
      missionsService = moduleFixture.get(MissionsService);
      processedEventsRepository = moduleFixture.get(ProcessedEventsRepository);

      kafka = new Kafka({
        clientId: "api-kafka-event-platform-e2e",
        brokers: (KAFKA_BROKERS ?? "").split(",").map((b) => b.trim()),
      });
      dlqProducer = kafka.producer();
      await dlqProducer.connect();
    });

    afterAll(async () => {
      await dlqProducer.disconnect();
      await app.close();
      await pgClient.end();
    });

    afterEach(async () => {
      if (createdMissionIds.length > 0) {
        await pgClient.query(
          `DELETE FROM audit_log WHERE mission_id = ANY($1)`,
          [createdMissionIds],
        );
        await pgClient.query(`DELETE FROM missions WHERE id = ANY($1)`, [
          createdMissionIds,
        ]);
        createdMissionIds.length = 0;
      }
      if (createdUserIds.length > 0) {
        await pgClient.query(`DELETE FROM users WHERE id = ANY($1)`, [
          createdUserIds,
        ]);
        createdUserIds.length = 0;
      }
    });

    /** Seeds a user + a mission already in QUEUED status, bypassing the HTTP/service layer (this suite tests the *consumer* side). */
    async function seedQueuedMission(): Promise<string> {
      const userId = randomUUID();
      const missionId = randomUUID();
      await pgClient.query(
        `INSERT INTO users (id, email, password_hash, display_name, created_at, updated_at)
         VALUES ($1, $2, 'unused', 'REQ-3.15 e2e user', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [userId, `req-3-15-${userId}@example.test`],
      );
      createdUserIds.push(userId);
      await pgClient.query(
        `INSERT INTO missions (id, title, status, video_object_key, created_by_id, created_at, updated_at)
         VALUES ($1, 'REQ-3.15 e2e mission', 'QUEUED', 'video.mp4', $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [missionId, userId],
      );
      createdMissionIds.push(missionId);
      return missionId;
    }

    function processingStartedEnvelope(
      eventId: string,
      missionId: string,
    ): string {
      const envelope: EventEnvelope<{ missionId: string }> = {
        eventId,
        eventType: "PROCESSING_STARTED",
        eventVersion: 1,
        occurredAt: new Date().toISOString(),
        correlationId: `corr-req-3-15-${eventId}`,
        causationId: null,
        producer: "vision-service",
        payload: { missionId },
      };
      return JSON.stringify(envelope);
    }

    it("does not apply a duplicate command delivery twice (REQ-3.8/3.15)", async () => {
      const missionId = await seedQueuedMission();
      const eventId = randomUUID();
      const rawValue = processingStartedEnvelope(eventId, missionId);
      const deps: ProcessingEventsHandlerDeps = {
        missionsService,
        processedEventsRepository,
        dlqProducer: unusedDlqProducer,
      };

      await handleProcessingEventMessage(rawValue, deps);
      // Redeliver the identical message — at-least-once delivery means
      // this must be a safe no-op, not a second transition.
      await handleProcessingEventMessage(rawValue, deps);

      const mission = await missionsService.getMission(missionId);
      expect(mission.status).toBe(MissionStatus.PROCESSING);

      const { rows: processedRows } = await pgClient.query<{
        count: number;
      }>(
        `SELECT count(*)::int AS count FROM processed_events WHERE event_id = $1 AND consumer = 'api'`,
        [eventId],
      );
      expect(processedRows[0]?.count).toBe(1);

      const { rows: auditRows } = await pgClient.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM audit_log WHERE mission_id = $1 AND action = 'mission.transition'`,
        [missionId],
      );
      expect(auditRows[0]?.count).toBe(1);
    }, 15_000);

    it("resumes after a simulated consumer crash/restart without duplicate side effects (REQ-3.15)", async () => {
      const missionId = await seedQueuedMission();
      const eventId = randomUUID();
      const rawValue = processingStartedEnvelope(eventId, missionId);

      await handleProcessingEventMessage(rawValue, {
        missionsService,
        processedEventsRepository,
        dlqProducer: unusedDlqProducer,
      });

      // Simulate the consumer process crashing and restarting: a brand
      // new module (new PrismaService/repository/service instances,
      // nothing shared in memory with the ones above) redelivers the
      // exact same message — only the real Postgres rows they both
      // point at carry the idempotency state across the "restart".
      const restartedModule = await Test.createTestingModule({
        imports: [PrismaModule, MissionsModule, ProcessedEventsModule],
      }).compile();
      const restartedApp = restartedModule.createNestApplication();
      await restartedApp.init();
      try {
        await handleProcessingEventMessage(rawValue, {
          missionsService: restartedModule.get(MissionsService),
          processedEventsRepository: restartedModule.get(
            ProcessedEventsRepository,
          ),
          dlqProducer: unusedDlqProducer,
        });
      } finally {
        await restartedApp.close();
      }

      const mission = await missionsService.getMission(missionId);
      expect(mission.status).toBe(MissionStatus.PROCESSING);

      const { rows: auditRows } = await pgClient.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM audit_log WHERE mission_id = $1 AND action = 'mission.transition'`,
        [missionId],
      );
      expect(auditRows[0]?.count).toBe(1);
    }, 20_000);

    it("dead-letters an event that exhausts its retry budget, verified via a real broker round-trip (REQ-3.9/3.10/3.15)", async () => {
      const eventId = randomUUID();
      // A missionId with no matching row makes every transition()
      // attempt reject with NotFoundException, deterministically
      // exhausting the retry budget without needing to fail Postgres
      // itself.
      const missingMissionId = `missing-${randomUUID()}`;
      const rawValue = processingStartedEnvelope(eventId, missingMissionId);

      const dlqMessages: EventEnvelope<DeadLetterPayload>[] = [];
      const dlqConsumer: Consumer = kafka.consumer({
        groupId: `api-kafka-event-platform-e2e-${randomUUID()}`,
      });
      await dlqConsumer.connect();
      await dlqConsumer.subscribe({
        topic: TOPICS.DEAD_LETTER,
        fromBeginning: false,
      });
      void dlqConsumer.run({
        eachMessage: ({ message }) => {
          if (message.value) {
            dlqMessages.push(
              JSON.parse(
                message.value.toString(),
              ) as EventEnvelope<DeadLetterPayload>,
            );
          }
          return Promise.resolve();
        },
      });
      // Give the consumer group a moment to finish joining before the
      // message is published, so it isn't missed.
      await new Promise((resolve) => setTimeout(resolve, 1_000));

      try {
        await handleProcessingEventMessage(rawValue, {
          missionsService,
          processedEventsRepository,
          dlqProducer,
        });

        await waitFor(() => dlqMessages.length > 0, 10_000);
      } finally {
        await dlqConsumer.disconnect();
      }

      expect(dlqMessages).toHaveLength(1);
      const [dlqEnvelope] = dlqMessages;
      expect(dlqEnvelope?.eventType).toBe("EVENT_DEAD_LETTERED");
      expect(dlqEnvelope?.causationId).toBe(eventId);
      expect(dlqEnvelope?.payload.attempts).toBe(3);
      expect(dlqEnvelope?.payload.topic).toBe(TOPICS.PROCESSING_EVENTS);
    }, 20_000);
  },
);
