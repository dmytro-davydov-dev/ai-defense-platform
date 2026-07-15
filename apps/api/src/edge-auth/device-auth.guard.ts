import { createHash } from "node:crypto";
import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedDevice } from "./device-auth.types";

interface EdgeDeviceAuthRow {
  id: string;
  deviceId: string;
}

/**
 * REQ-9.9/9.10 (docs/adr/ADR-011-device-identity-and-sync-transport.md):
 * verifies the `Authorization: Bearer <token>` header against
 * `edge_devices.token_hash` — a SHA-256 hex digest of the device's
 * credential, never the credential itself (the credential is returned
 * exactly once, at `POST /devices` registration time). A fast hash, not
 * bcrypt: the token is a 256-bit random value with no human-guessable
 * structure, so it needs no slow-hashing defense, and a device may
 * synchronize frequently — see the ADR's Decision section for why this
 * trade-off is deliberate, not an oversight.
 *
 * Revoked devices (`revoked_at IS NOT NULL`) are rejected the same as an
 * unrecognized token — indistinguishable from the caller's perspective,
 * consistent with `AuthService`'s existing "don't leak which part of
 * auth failed" posture for login.
 *
 * Attaches `request.device: AuthenticatedDevice` on success — read it
 * via `@CurrentDevice()`, mirroring `@CurrentUser()`.
 */
@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException("EDGE_DEVICE_TOKEN_MISSING");
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const rows = await this.prisma.$queryRaw<EdgeDeviceAuthRow[]>`
      SELECT "id", "device_id" AS "deviceId"
      FROM "edge_devices"
      WHERE "token_hash" = ${tokenHash}
        AND "revoked_at" IS NULL
    `;
    const device = rows[0];
    if (!device) {
      throw new UnauthorizedException("EDGE_DEVICE_TOKEN_INVALID");
    }

    (request as Request & { device: AuthenticatedDevice }).device = device;
    return true;
  }
}

function extractBearerToken(request: Request): string | undefined {
  const header = request.headers.authorization;
  if (!header) {
    return undefined;
  }
  const [scheme, value] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !value) {
    return undefined;
  }
  return value;
}
