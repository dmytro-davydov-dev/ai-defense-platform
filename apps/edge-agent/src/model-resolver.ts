import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { log } from "@ai-defense/observability";

export interface ModelResolverConfig {
  readonly apiBaseUrl: string;
  readonly deviceToken: string;
  readonly modelCachePath: string;
}

export interface ResolvedModel {
  readonly modelVersionId: string;
  readonly objectKey: string;
  readonly localPath: string;
}

/** Minimal surface this module needs from the global `fetch` — injectable for tests. */
export type FetchLike = typeof fetch;

interface ProductionModelResponse {
  readonly id: string;
  readonly objectKey: string;
}

interface SignedUrlResponse {
  readonly url: string;
}

/**
 * REQ-9.13/9.15 (docs/mvp-plan/PRD-Phase-9.md,
 * docs/adr/ADR-011-device-identity-and-sync-transport.md): resolves
 * the current production model (if any, via `GET /models/production`,
 * `JwtOrDeviceAuthGuard`-accepting) and downloads it through a
 * presigned MinIO URL (`GET /storage/download-url`, same guard) — this
 * device never holds MinIO credentials directly, unlike
 * `apps/vision-service`'s own cloud-side factory (see the ADR's
 * Decision section for why that asymmetry is deliberate). Returns
 * `null` if no model has ever been promoted (a 404) — the caller
 * should treat this the same "not configured yet, not broken" way
 * `detection/factory.py` already treats an empty
 * `VISION_SERVICE_DETECTION_MODEL_PATH`.
 */
export async function resolveAndDownloadProductionModel(
  config: ModelResolverConfig,
  fetchImpl: FetchLike = fetch,
): Promise<ResolvedModel | null> {
  const base = config.apiBaseUrl.replace(/\/$/, "");
  const authHeaders = { Authorization: `Bearer ${config.deviceToken}` };

  const productionResponse = await fetchImpl(`${base}/models/production`, {
    headers: authHeaders,
  });
  if (productionResponse.status === 404) {
    log("info", "edge agent: no production model registered yet");
    return null;
  }
  if (!productionResponse.ok) {
    throw new Error(`GET /models/production failed with status ${productionResponse.status}`);
  }
  const production = (await productionResponse.json()) as ProductionModelResponse;

  const downloadUrlResponse = await fetchImpl(
    `${base}/storage/download-url?objectKey=${encodeURIComponent(production.objectKey)}`,
    { headers: authHeaders },
  );
  if (!downloadUrlResponse.ok) {
    throw new Error(`GET /storage/download-url failed with status ${downloadUrlResponse.status}`);
  }
  const { url } = (await downloadUrlResponse.json()) as SignedUrlResponse;

  const fileResponse = await fetchImpl(url);
  if (!fileResponse.ok || !fileResponse.body) {
    throw new Error(`downloading model artifact failed with status ${fileResponse.status}`);
  }
  await pipeline(
    Readable.fromWeb(fileResponse.body as NodeWebReadableStream<Uint8Array>),
    createWriteStream(config.modelCachePath),
  );

  log("info", "edge agent: production model downloaded", {
    modelVersionId: production.id,
    objectKey: production.objectKey,
    localPath: config.modelCachePath,
  });

  return {
    modelVersionId: production.id,
    objectKey: production.objectKey,
    localPath: config.modelCachePath,
  };
}
