import { mockClient } from "aws-sdk-client-mock";
import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { StorageService } from "./storage.service";

describe("StorageService", () => {
  const s3Mock = mockClient(S3Client);

  beforeEach(() => {
    s3Mock.reset();
    process.env["MINIO_ENDPOINT"] = "minio";
    process.env["MINIO_PORT"] = "9000";
    process.env["MINIO_ROOT_USER"] = "test-user";
    process.env["MINIO_ROOT_PASSWORD"] = "test-password";
    process.env["MINIO_MISSIONS_BUCKET"] = "test-bucket";
  });

  it("throws if MinIO credentials are missing", () => {
    delete process.env["MINIO_ROOT_USER"];
    expect(() => new StorageService()).toThrow(
      /MINIO_ROOT_USER and MINIO_ROOT_PASSWORD must be set/,
    );
  });

  it("builds a collision-resistant object key with a sanitized filename", () => {
    const service = new StorageService();
    const key = service.buildObjectKey("uploads", "my video (final) v2.mp4");
    expect(key).toMatch(/^uploads\/[0-9a-f-]{36}-my_video__final__v2\.mp4$/);
  });

  it("generates a presigned PUT URL scoped to the configured bucket and key", async () => {
    const service = new StorageService();
    const result = await service.generateUploadUrl(
      "uploads/abc-video.mp4",
      "video/mp4",
      120,
    );

    expect(result.objectKey).toBe("uploads/abc-video.mp4");
    expect(result.url).toContain("test-bucket");
    expect(result.url).toContain("uploads/abc-video.mp4");
    expect(result.url).toMatch(/X-Amz-Expires=120/);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("generates a presigned GET URL scoped to the configured bucket and key", async () => {
    const service = new StorageService();
    const result = await service.generateDownloadUrl(
      "uploads/abc-video.mp4",
      60,
    );

    expect(result.url).toContain("test-bucket");
    expect(result.url).toContain("uploads/abc-video.mp4");
    expect(result.url).toMatch(/X-Amz-Expires=60/);
  });

  describe("ensureBucketExists", () => {
    it("does nothing when the bucket already exists", async () => {
      s3Mock.on(HeadBucketCommand).resolves({});
      const service = new StorageService();

      await service.ensureBucketExists();

      expect(s3Mock.commandCalls(CreateBucketCommand)).toHaveLength(0);
    });

    it("creates the bucket when HeadBucket reports it missing", async () => {
      s3Mock.on(HeadBucketCommand).rejects(
        Object.assign(new Error("Not Found"), {
          name: "NotFound",
          $metadata: { httpStatusCode: 404 },
        }),
      );
      s3Mock.on(CreateBucketCommand).resolves({});
      const service = new StorageService();

      await service.ensureBucketExists();

      expect(s3Mock.commandCalls(CreateBucketCommand)).toHaveLength(1);
    });

    it("rethrows unexpected errors instead of trying to create the bucket", async () => {
      s3Mock.on(HeadBucketCommand).rejects(
        Object.assign(new Error("Forbidden"), {
          name: "Forbidden",
          $metadata: { httpStatusCode: 403 },
        }),
      );
      const service = new StorageService();

      await expect(service.ensureBucketExists()).rejects.toThrow("Forbidden");
      expect(s3Mock.commandCalls(CreateBucketCommand)).toHaveLength(0);
    });
  });
});
