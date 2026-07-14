import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types";
import { Client as PgClient } from "pg";
import { AppModule } from "../src/app.module";
import { MissionStatus } from "../generated/prisma/client";
import type { AuthResponseDto } from "../src/auth/dto/auth-response.dto";
import type { MissionResponseDto } from "../src/missions/dto/mission-response.dto";
import type { SignedUrlResponseDto } from "../src/storage/dto/signed-url-response.dto";

interface ErrorResponseBody {
  statusCode: number;
  message: string;
}

/**
 * REQ-2.14 (docs/mvp-plan/PRD-Phase-2.md): the three integration tests the
 * PRD calls out by name — mission CRUD round-trip, signed URL generation,
 * illegal-transition rejection — run against a real Postgres and real
 * MinIO (Compose), driven entirely over HTTP (supertest against a full
 * `AppModule`), the same way a real client hits `apps/api`.
 *
 * `KafkaModule` is part of `AppModule` but does not need to be excluded:
 * `ProcessingEventsConsumerService.onModuleInit()` (src/kafka/processing-
 * events-consumer.service.ts) treats a missing `KAFKA_BROKERS` as a
 * warn-and-continue no-op, not a startup failure — REQ-2.14 only requires
 * Postgres and MinIO, not Redpanda/Kafka (see REQ-3.15's
 * kafka-event-platform.e2e-spec.ts for the Kafka-broker-requiring suite).
 *
 * Requires a running local stack:
 *   docker compose -f infrastructure/compose/docker-compose.yml up -d postgres minio
 * with `DATABASE_URL`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `JWT_SECRET`
 * exported to match (see `.env.example`).
 *
 * Not runnable in this sandbox — no docker daemon is available here (the
 * same, already-documented limitation as REQ-3.15's integration tests; see
 * docs/roadmap/Progress.md Known gaps).
 */
const DATABASE_URL = process.env["DATABASE_URL"];
const JWT_SECRET = process.env["JWT_SECRET"];
const MINIO_READY = Boolean(
  process.env["MINIO_ROOT_USER"] && process.env["MINIO_ROOT_PASSWORD"],
);
const INTEGRATION_READY = Boolean(DATABASE_URL && JWT_SECRET && MINIO_READY);

if (!INTEGRATION_READY) {
  console.warn(
    "Skipping apps/api mission lifecycle e2e tests (REQ-2.14): set " +
      "DATABASE_URL, JWT_SECRET, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD " +
      "against a running `docker compose up postgres minio` stack to run " +
      "them. Not runnable in this sandbox — see docs/roadmap/Progress.md " +
      "Known gaps.",
  );
}

(INTEGRATION_READY ? describe : describe.skip)(
  "Mission lifecycle (e2e, REQ-2.14)",
  () => {
    let app: INestApplication<App>;
    let pgClient: PgClient;
    const createdUserIds: string[] = [];
    const createdMissionIds: string[] = [];

    beforeAll(async () => {
      pgClient = new PgClient({ connectionString: DATABASE_URL });
      await pgClient.connect();

      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = moduleFixture.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app.close();
      await pgClient.end();
    });

    afterEach(async () => {
      if (createdMissionIds.length > 0) {
        await pgClient.query(
          `DELETE FROM outbox WHERE aggregate_id = ANY($1)`,
          [createdMissionIds],
        );
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
        await pgClient.query(
          `DELETE FROM audit_log WHERE actor_user_id = ANY($1)`,
          [createdUserIds],
        );
        await pgClient.query(`DELETE FROM user_roles WHERE user_id = ANY($1)`, [
          createdUserIds,
        ]);
        await pgClient.query(`DELETE FROM users WHERE id = ANY($1)`, [
          createdUserIds,
        ]);
        createdUserIds.length = 0;
      }
    });

    /** Registers a fresh operator (REQ-2.4/2.5: register() auto-assigns ROLE_NAMES.OPERATOR) and returns a bearer token for it. */
    async function registerOperator(): Promise<{
      accessToken: string;
      userId: string;
    }> {
      const email = `req-2-14-${randomUUID()}@example.test`;
      const response = await request(app.getHttpServer())
        .post("/auth/register")
        .send({
          email,
          password: "correct horse battery staple",
          displayName: "REQ-2.14 e2e operator",
        })
        .expect(201);

      const body = response.body as AuthResponseDto;
      createdUserIds.push(body.user.id);
      return { accessToken: body.accessToken, userId: body.user.id };
    }

    async function createMission(
      accessToken: string,
      title = "REQ-2.14 e2e mission",
    ): Promise<MissionResponseDto> {
      const response = await request(app.getHttpServer())
        .post("/missions")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ title, description: "Seeded by REQ-2.14 e2e test" })
        .expect(201);

      const mission = response.body as MissionResponseDto;
      createdMissionIds.push(mission.id);
      return mission;
    }

    it("creates, reads, lists, and updates a mission end-to-end (mission CRUD round-trip)", async () => {
      const { accessToken } = await registerOperator();

      const created = await createMission(
        accessToken,
        "Coastal flyover — sector 4",
      );
      expect(created).toMatchObject({
        title: "Coastal flyover — sector 4",
        description: "Seeded by REQ-2.14 e2e test",
        status: MissionStatus.DRAFT,
        videoObjectKey: null,
      });
      const missionId = created.id;

      const getResponse = await request(app.getHttpServer())
        .get(`/missions/${missionId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);
      expect(getResponse.body).toMatchObject({
        id: missionId,
        title: "Coastal flyover — sector 4",
      });

      const listResponse = await request(app.getHttpServer())
        .get("/missions")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);
      const missions = listResponse.body as MissionResponseDto[];
      expect(missions.some((mission) => mission.id === missionId)).toBe(true);

      const patchResponse = await request(app.getHttpServer())
        .patch(`/missions/${missionId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ title: "Coastal flyover — sector 4 (rescheduled)" })
        .expect(200);
      const patched = patchResponse.body as MissionResponseDto;
      expect(patched.title).toBe("Coastal flyover — sector 4 (rescheduled)");

      const afterPatch = await request(app.getHttpServer())
        .get(`/missions/${missionId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);
      const afterPatchBody = afterPatch.body as MissionResponseDto;
      expect(afterPatchBody.title).toBe(
        "Coastal flyover — sector 4 (rescheduled)",
      );
    });

    it("issues a signed upload URL, scoped to the mission, and attaches the object key (signed URL generation)", async () => {
      const { accessToken } = await registerOperator();
      const created = await createMission(accessToken);
      const missionId = created.id;

      const uploadUrlResponse = await request(app.getHttpServer())
        .post(`/missions/${missionId}/upload-url`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ fileName: "sector-4-flyover.mp4", contentType: "video/mp4" })
        .expect(201);

      const { url, objectKey, expiresAt } =
        uploadUrlResponse.body as SignedUrlResponseDto;
      expect(typeof url).toBe("string");
      expect(url.length).toBeGreaterThan(0);
      expect(objectKey.startsWith(`missions/${missionId}/`)).toBe(true);
      expect(objectKey.endsWith("sector-4-flyover.mp4")).toBe(true);
      expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());

      // REQ-2.9: issuing the URL also attaches the object key to the mission.
      const afterUpload = await request(app.getHttpServer())
        .get(`/missions/${missionId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);
      const afterUploadBody = afterUpload.body as MissionResponseDto;
      expect(afterUploadBody.videoObjectKey).toBe(objectKey);
    });

    it("rejects an illegal state transition and leaves the mission unchanged (illegal-transition rejection)", async () => {
      const { accessToken } = await registerOperator();
      const created = await createMission(accessToken);
      const missionId = created.id;

      // Mission_State_Machine.md: DRAFT may only transition to QUEUED —
      // DRAFT -> COMPLETED skips the entire pipeline and must be rejected.
      const transitionResponse = await request(app.getHttpServer())
        .post(`/missions/${missionId}/transition`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ targetState: MissionStatus.COMPLETED })
        .expect(409);
      const errorBody = transitionResponse.body as ErrorResponseBody;
      expect(errorBody.message).toContain("MISSION_ILLEGAL_TRANSITION");
      expect(errorBody.message).toContain(
        `${MissionStatus.DRAFT}->${MissionStatus.COMPLETED}`,
      );

      const afterRejection = await request(app.getHttpServer())
        .get(`/missions/${missionId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);
      const afterRejectionBody = afterRejection.body as MissionResponseDto;
      expect(afterRejectionBody.status).toBe(MissionStatus.DRAFT);
    });
  },
);
