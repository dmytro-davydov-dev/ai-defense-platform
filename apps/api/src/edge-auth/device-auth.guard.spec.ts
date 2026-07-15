import { createHash } from "node:crypto";
import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { DeviceAuthGuard } from "./device-auth.guard";
import type { PrismaService } from "../prisma/prisma.service";

function makeContext(authorizationHeader: string | undefined): {
  context: ExecutionContext;
  request: { device?: unknown };
} {
  const request: {
    headers: Record<string, string | undefined>;
    device?: unknown;
  } = {
    headers: { authorization: authorizationHeader },
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe("DeviceAuthGuard (REQ-9.9/9.10)", () => {
  const token = "a".repeat(64);
  const tokenHash = createHash("sha256").update(token).digest("hex");

  let prisma: { $queryRaw: jest.Mock };
  let guard: DeviceAuthGuard;

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn().mockResolvedValue([]) };
    guard = new DeviceAuthGuard(prisma as unknown as PrismaService);
  });

  it("rejects a request with no Authorization header", async () => {
    const { context } = makeContext(undefined);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects a non-Bearer Authorization header", async () => {
    const { context } = makeContext(`Basic ${token}`);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects an unrecognized token (no matching, non-revoked device)", async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    const { context } = makeContext(`Bearer ${token}`);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("accepts a valid token, hashing it before lookup, and attaches request.device", async () => {
    prisma.$queryRaw.mockResolvedValue([
      { id: "device-1", deviceId: "jetson-01" },
    ]);
    const { context, request } = makeContext(`Bearer ${token}`);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.device).toEqual({ id: "device-1", deviceId: "jetson-01" });

    // The guard must look up the *hash*, never the plaintext token —
    // `$queryRaw` is a tagged template, so Jest sees it called with
    // (stringsArray, ...interpolatedValues); the hash must be among
    // those values and the plaintext token must not.
    const interpolatedValues = (
      prisma.$queryRaw.mock.calls[0] as unknown[]
    ).slice(1);
    expect(interpolatedValues).toContain(tokenHash);
    expect(interpolatedValues).not.toContain(token);
  });
});
