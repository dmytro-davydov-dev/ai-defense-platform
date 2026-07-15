import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveAndDownloadProductionModel } from "./model-resolver.js";

const CONFIG_BASE = { apiBaseUrl: "http://api.test", deviceToken: "test-token" };

void test("returns null when no production model has ever been promoted (404)", async () => {
  const fetchImpl = (() =>
    Promise.resolve(new Response(null, { status: 404 }))) as unknown as typeof fetch;

  const result = await resolveAndDownloadProductionModel(
    { ...CONFIG_BASE, modelCachePath: "/tmp/unused.onnx" },
    fetchImpl,
  );

  assert.equal(result, null);
});

void test("resolves the production model, requests a signed download URL with the device token, and downloads the bytes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "edge-agent-model-resolver-"));
  const modelCachePath = join(dir, "model.onnx");
  const calls: string[] = [];

  const fetchImpl = ((url: string, init?: RequestInit) => {
    calls.push(url);
    const headers = init?.headers as Record<string, string> | undefined;
    if (url.includes("/models/production")) {
      assert.equal(headers?.["Authorization"], "Bearer test-token");
      return Promise.resolve(
        new Response(JSON.stringify({ id: "model-1", objectKey: "model-1/model.onnx" }), {
          status: 200,
        }),
      );
    }
    if (url.includes("/storage/download-url")) {
      assert.equal(headers?.["Authorization"], "Bearer test-token");
      assert.ok(url.includes(encodeURIComponent("model-1/model.onnx")));
      return Promise.resolve(
        new Response(JSON.stringify({ url: "http://minio.test/signed" }), { status: 200 }),
      );
    }
    if (url === "http://minio.test/signed") {
      return Promise.resolve(new Response("fake-onnx-bytes"));
    }
    throw new Error(`unexpected fetch call: ${url}`);
  }) as unknown as typeof fetch;

  try {
    const result = await resolveAndDownloadProductionModel(
      { ...CONFIG_BASE, modelCachePath },
      fetchImpl,
    );

    assert.deepEqual(result, {
      modelVersionId: "model-1",
      objectKey: "model-1/model.onnx",
      localPath: modelCachePath,
    });
    assert.equal(readFileSync(modelCachePath, "utf8"), "fake-onnx-bytes");
    assert.equal(calls.length, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

void test("throws when GET /models/production fails with a non-404 error status", async () => {
  const fetchImpl = (() =>
    Promise.resolve(new Response("server error", { status: 500 }))) as unknown as typeof fetch;

  await assert.rejects(
    resolveAndDownloadProductionModel(
      { ...CONFIG_BASE, modelCachePath: "/tmp/unused.onnx" },
      fetchImpl,
    ),
  );
});
