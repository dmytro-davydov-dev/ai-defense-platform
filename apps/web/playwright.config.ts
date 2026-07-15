import { defineConfig, devices } from "@playwright/test";

/**
 * REQ-6.18: one critical-path end-to-end test — create mission -> upload
 * -> observe live status -> see detections rendered. Requires the full
 * Compose stack running (`docker compose --env-file .env -f
 * infrastructure/compose/docker-compose.yml up`) — `apps/web` alone
 * isn't enough, since the test drives real login/mission/upload/Kafka
 * flows against `apps/api`. Not run in this sandbox (no docker, see
 * docs/roadmap/Progress.md's Phase 6 Known gaps) — written and reviewed,
 * same "written, not yet run" posture every prior phase's integration
 * tests have used.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_WEB_BASE_URL ?? "http://localhost:5173",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
