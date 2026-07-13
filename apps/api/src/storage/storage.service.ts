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

export interface SignedUrlResult {
  url: string;
  objectKey: string;
  expiresAt: Date;
}

const DEFAULT_EXPIRY_SECONDS = 900; // 15 minutes

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
  private readonly bucket: string;

  constructor() {
    const endpoint = process.env["MINIO_ENDPOINT"] ?? "localhost";
    const port = process.env["MINIO_PORT"] ?? "9000";
    const accessKeyId = process.env["MINIO_ROOT_USER"];
    const secretAccessKey = process.env["MINIO_ROOT_PASSWORD"];
    this.bucket = process.env["MINIO_MISSIONS_BUCKET"] ?? "mission-videos";

    if (!accessKeyId || !secretAccessKey) {
      // Fail loudly rather than silently issuing URLs no MinIO server
      // will accept — consistent with REQ-1.18's ":?"-style Compose
      // guards for the same variables.
      throw new Error(
        "MINIO_ROOT_USER and MINIO_ROOT_PASSWORD must be set (see .env.example)",
      );
    }

    this.client = new S3Client({
      endpoint: `http://${endpoint}:${port}`,
      // MinIO doesn't support virtual-hosted-style bucket addressing by
      // default — path-style is required.
      forcePathStyle: true,
      // MinIO ignores the region value but the SDK requires one to be
      // set for SigV4 signing.
      region: "us-east-1",
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.ensureBucketExists();
  }

  /** Idempotent: creates the bucket if it doesn't already exist. */
  async ensureBucketExists(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
      this.logger.log(`Bucket "${this.bucket}" not found — creating it.`);
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
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
    const url = await getSignedUrl(this.client, command, {
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
    const url = await getSignedUrl(this.client, command, {
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
