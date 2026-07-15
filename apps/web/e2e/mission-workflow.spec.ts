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
 * REQ-6.18 (extended by REQ-7.9): the MVP plan's named critical path —
 * create mission -> upload -> observe live status -> see detections
 * rendered — now also covers uploading a telemetry file and confirming
 * the map container renders the route with its mandatory
 * approximate-position labeling. Registers a fresh operator account per
 * run (unique email) rather than depending on seeded credentials, since
 * nothing in this repo currently seeds one.
 *
 * Requires the full Compose stack up (apps/web, apps/api, Postgres,
 * Redpanda, MinIO, apps/vision-service, apps/outbox-publisher) with a
 * real detection model configured — otherwise `PROCESSING_COMPLETED`
 * still fires (Phase 4's stub-safe pipeline) but with zero detections,
 * and the final assertion will need loosening to "mission reaches
 * COMPLETED" only. Not run in this sandbox (no docker) — see
 * docs/roadmap/Progress.md's Known gaps.
 */
test("create mission, upload, watch it process, see detections and telemetry route", async ({
  page,
}) => {
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

  // REQ-7.9: upload a minimal, inline telemetry fixture (no repo fixture
  // file needed — Playwright can hand a file chooser an in-memory
  // buffer) and confirm the map container renders the route with its
  // mandatory approximate-position labeling (REQ-7.7).
  await page.getByRole("tab", { name: "Overview" }).click();
  await page.getByRole("button", { name: "Upload CSV or GeoJSON" }).click();
  const telemetryChooser = await page.waitForEvent("filechooser");
  await telemetryChooser.setFiles({
    name: "telemetry.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      [
        "timestamp,lat,lon",
        "2026-07-15T10:00:00.000Z,37.7749,-122.4194",
        "2026-07-15T10:00:01.000Z,37.7750,-122.4193",
        "2026-07-15T10:00:02.000Z,37.7751,-122.4192",
      ].join("\n"),
    ),
  });
  await expect(page.getByText(/Ingested 3 telemetry points/)).toBeVisible();
  await expect(
    page.getByText(
      "Approximate position — estimated from telemetry, never verified targeting data",
    ),
  ).toBeVisible();
});
