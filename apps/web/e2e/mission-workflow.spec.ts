import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Phase 4's deterministic synthetic fixture (12 frames, 64x48, 4fps;
 * regeneratable via `apps/vision-service/scripts/generate_samples.py`)
 * — the same clip Phase 4/5's own test suites already use, so a real
 * detector adapter (if `VISION_SERVICE_DETECTION_MODEL_PATH` is
 * configured on the running stack) has a real, small, fast-to-process
 * video to run against.
 */
const SAMPLE_VIDEO_PATH = path.resolve(
  __dirname,
  "../../vision-service/samples/sample-mission-clip.mp4",
);

/**
 * REQ-6.18: the MVP plan's named critical path — create mission ->
 * upload -> observe live status -> see detections rendered. Registers a
 * fresh operator account per run (unique email) rather than depending on
 * seeded credentials, since nothing in this repo currently seeds one.
 *
 * Requires the full Compose stack up (apps/web, apps/api, Postgres,
 * Redpanda, MinIO, apps/vision-service, apps/outbox-publisher) with a
 * real detection model configured — otherwise `PROCESSING_COMPLETED`
 * still fires (Phase 4's stub-safe pipeline) but with zero detections,
 * and the final assertion will need loosening to "mission reaches
 * COMPLETED" only. Not run in this sandbox (no docker) — see
 * docs/roadmap/Progress.md's Phase 6 Known gaps.
 */
test("create mission, upload, watch it process, see detections", async ({ page }) => {
  const email = `e2e-${Date.now()}@ai-defense.example`;

  await page.goto("/login");
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Display name").fill("E2E Operator");
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/missions$/);

  await page.getByRole("button", { name: "New mission" }).click();
  await page.getByLabel("Title").fill("E2E flyover");
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page).toHaveURL(/\/missions\/[\w-]+$/);

  await page.getByRole("button", { name: "Choose video file" }).click();
  const fileChooser = await page.waitForEvent("filechooser");
  await fileChooser.setFiles(SAMPLE_VIDEO_PATH);
  await expect(page.getByText("Upload complete")).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("button", { name: "Submit for processing" }).click();
  await expect(page.getByText("QUEUED")).toBeVisible();

  // REQ-6.12: live status via the WebSocket relay, not a manual refresh.
  await expect(page.getByText("COMPLETED")).toBeVisible({ timeout: 60_000 });

  await expect(page.getByText(/^Detections$/)).toBeVisible();
  await page.getByRole("tab", { name: "Event timeline" }).click();
  await expect(page.getByText("Detections recorded")).toBeVisible();
});
