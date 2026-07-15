import { randomUUID } from "node:crypto";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import {
  CreateBucketCommand,
  HeadBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * PRD-Phase-8 (docs/mvp-plan/PRD-Phase-8.md REQ-8.3/8.9): the two new
 * buckets Phase 8 introduces, alongside the existing mission-videos
 * bucket — `datasets/{datasetId}/...` for split manifests
 * (`DatasetsRepository`) and `models/{modelVersionId}/...` for exported
 * `.onnx` artifacts (uploaded directly by `apps/vision-service`'s
 * training script via its own `MinioClient`, not through this service —
 * `apps/api` only ever reads the resulting object key back). Separate
 * buckets rather than new prefixes inside `mission-videos` for a clean
 * per-bucket lifecycle/retention policy later, consistent with
 * docs/architecture/Repository_Structure.md's top-level `datasets/`/
 * `models/` folders this phase adds.
 */
const DEFAULT_DATASETS_BUCKET = "datasets";
const DEFAULT_MODELS_BUCKET = "models";

export interface SignedUrlResult {
  url: string;
  objectKey: string;
  expiresAt: Date;
}

const DEFAULT_EXPIRY_SECONDS = 900; // 15 minutes

/** `.env.example`-documented vars ship blank rather than absent, so `??` alone won't fall through — treat `""` the same as unset. */
function nonEmptyEnv(value: string | undefined): string | undefined {
  return value !== undefined && value.trim().length > 0 ? value : undefined;
}

/**
 * Signed upload/download URL generation against MinIO (REQ-2.9,
 * docs/mvp-plan/PRD-Phase-2.md). `apps/api` never proxies video bytes —
 * it only issues time-limited presigned S3 URLs the client uses
 * directly against MinIO.
 *
 * Configuration is sourced entirely from the same MINIO_* env vars
 * apps/api already receives via infrastructure/compose/docker-compose.yml
 * (REQ-1.18: no hardcoded secrets/endpoints).
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly presignClient: S3Client;
  private readonly bucket: string;
  private readonly datasetsBucket: string;
  private readonly modelsBucket: string;

  constructor() {
    const endpoint = process.env["MINIO_ENDPOINT"] ?? "localhost";
    const port = process.env["MINIO_PORT"] ?? "9000";
    const accessKeyId = process.env["MINIO_ROOT_USER"];
    const secretAccessKey = process.env["MINIO_ROOT_PASSWORD"];
    this.bucket = process.env["MINIO_MISSIONS_BUCKET"] ?? "mission-videos";
    this.datasetsBucket =
      process.env["MINIO_DATASETS_BUCKET"] ?? DEFAULT_DATASETS_BUCKET;
    this.modelsBucket =
      process.env["MINIO_MODELS_BUCKET"] ?? DEFAULT_MODELS_BUCKET;

    if (!accessKeyId || !secretAccessKey) {
      // Fail loudly rather than silently issuing URLs no MinIO server
      // will accept — consistent with REQ-1.18's ":?"-style Compose
      // guards for the same variables.
      throw new Error(
        "MINIO_ROOT_USER and MINIO_ROOT_PASSWORD must be set (see .env.example)",
      );
    }

    const internalEndpointUrl = `http://${endpoint}:${port}`;
    // REQ-2.9: presigned URLs are handed to the *browser*, which can't
    // resolve `MINIO_ENDPOINT` when it's the in-Compose service name
    // ("minio") — that hostname only exists inside the Docker network.
    // MINIO_PUBLIC_ENDPOINT lets Compose supply a browser-reachable
    // host (e.g. http://localhost:9000) for signing only, while every
    // server-side call (bucket checks, uploadText/downloadText) keeps
    // using the internal endpoint apps/api itself can actually reach.
    // Blank/unset falls back to the internal endpoint, preserving the
    // original single-endpoint behavior for non-Compose local runs.
    const publicEndpointUrl =
      nonEmptyEnv(process.env["MINIO_PUBLIC_ENDPOINT"]) ?? internalEndpointUrl;

    const sharedClientConfig = {
      // MinIO doesn't support virtual-hosted-style bucket addressing by
      // default — path-style is required.
      forcePathStyle: true,
      // MinIO ignores the region value but the SDK requires one to be
      // set for SigV4 signing.
      region: "us-east-1",
      credentials: { accessKeyId, secretAccessKey },
    };
    this.client = new S3Client({
      endpoint: internalEndpointUrl,
      ...sharedClientConfig,
    });
    this.presignClient =
      publicEndpointUrl === internalEndpointUrl
        ? this.client
        : new S3Client({ endpoint: publicEndpointUrl, ...sharedClientConfig });
  }

  async onModuleInit(): Promise<void> {
    await this.ensureBucketExists();
    // PRD-Phase-8: created alongside the missions bucket so
    // DatasetsService/ModelRegistryService never have to special-case
    // "first write to this bucket" — same idempotent-on-startup posture
    // REQ-1.17 already established.
    await this.ensureBucket(this.datasetsBucket);
    await this.ensureBucket(this.modelsBucket);
  }

  /** Idempotent: creates the configured missions bucket if it doesn't already exist. */
  async ensureBucketExists(): Promise<void> {
    await this.ensureBucket(this.bucket);
  }

  /** Idempotent: creates `bucket` if it doesn't already exist. */
  async ensureBucket(bucket: string): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
      this.logger.log(`Bucket "${bucket}" not found — creating it.`);
      await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
    }
  }

  /** PRD-Phase-8 REQ-8.3: the bucket dataset split manifests are written to. */
  getDatasetsBucket(): string {
    return this.datasetsBucket;
  }

  /** PRD-Phase-8 REQ-8.9: the bucket `apps/vision-service`'s training script uploads exported `.onnx` artifacts to; `apps/api` only ever reads object keys back, never uploads here itself. */
  getModelsBucket(): string {
    return this.modelsBucket;
  }

  /**
   * REQ-8.3: writes a small text object (a split's train/validation/test
   * manifest — a newline-delimited item-id list) directly, rather than
   * issuing a presigned URL for a client to PUT to — the caller here is
   * `apps/api` itself (`DatasetsService`, computing the split
   * server-side), not a browser, so there's no reason to round-trip
   * through a signed URL.
   */
  async uploadText(
    bucket: string,
    objectKey: string,
    content: string,
    contentType = "text/plain",
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: content,
        ContentType: contentType,
      }),
    );
  }

  /** Reads a small text object back (e.g. a split manifest) directly, mirroring `uploadText`. */
  async downloadText(bucket: string, objectKey: string): Promise<string> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: bucket, Key: objectKey }),
    );
    const body = result.Body;
    if (!body) {
      return "";
    }
    // The SDK v3 body is a web/node stream depending on runtime; `transformToString`
    // is the SDK's own helper for exactly this, available on both.
    return body.transformToString("utf-8");
  }

  /** Builds a collision-resistant object key under a fixed prefix. */
  buildObjectKey(prefix: string, fileName: string): string {
    const sanitized = fileName.replace(/[^a-zA-Z0-9_.-]/g, "_");
    return `${prefix}/${randomUUID()}-${sanitized}`;
  }

  async generateUploadUrl(
    objectKey: string,
    contentType: string,
    expiresInSeconds = DEFAULT_EXPIRY_SECONDS,
  ): Promise<SignedUrlResult> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: contentType,
    });
    const url = await getSignedUrl(this.presignClient, command, {
      expiresIn: expiresInSeconds,
    });
    return {
      url,
      objectKey,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    };
  }

  async generateDownloadUrl(
    objectKey: string,
    expiresInSeconds = DEFAULT_EXPIRY_SECONDS,
  ): Promise<SignedUrlResult> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
    });
    const url = await getSignedUrl(this.presignClient, command, {
      expiresIn: expiresInSeconds,
    });
    return {
      url,
      objectKey,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    };
  }
}

function isNotFoundError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const withMetadata = error as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    withMetadata.name === "NotFound" ||
    withMetadata.$metadata?.httpStatusCode === 404
  );
}
