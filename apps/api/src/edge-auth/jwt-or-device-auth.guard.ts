import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { firstValueFrom, isObservable } from "rxjs";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { DeviceAuthGuard } from "./device-auth.guard";

/**
 * REQ-9.13/9.15 (docs/adr/ADR-011-device-identity-and-sync-transport.md):
 * accepts either an operator/admin JWT (`JwtAuthGuard`, unchanged
 * behavior for every existing caller) or an edge device's bearer token
 * (`DeviceAuthGuard`) — applied to the two routes an edge agent needs to
 * resolve and download its production model without ever being issued
 * an operator account: `GET /models/production`
 * (`ModelRegistryController`) and `GET /storage/download-url`
 * (`StorageController`).
 *
 * Tries the JWT path first (the common case, every existing browser/
 * operator client), falling back to the device path only if it fails —
 * order has no security consequence here since both are independent,
 * narrow checks, but matching the more common path first avoids an
 * unnecessary DB round-trip for every ordinary operator request.
 */
@Injectable()
export class JwtOrDeviceAuthGuard implements CanActivate {
  constructor(
    private readonly jwtAuthGuard: JwtAuthGuard,
    private readonly deviceAuthGuard: DeviceAuthGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      // `CanActivate.canActivate()` is typed `boolean | Promise<boolean> |
      // Observable<boolean>` (the passport-backed JwtAuthGuard can return
      // any of the three) — `Promise.resolve(...)` alone doesn't unwrap
      // an Observable, it just wraps it, so `await` on that yields the
      // Observable itself, not a boolean.
      const result = this.jwtAuthGuard.canActivate(context);
      const allowed = isObservable(result)
        ? await firstValueFrom(result)
        : await result;
      if (allowed) {
        return true;
      }
    } catch {
      // JWT auth failed (missing/invalid/expired token) — fall through
      // to the device path below.
    }
    return this.deviceAuthGuard.canActivate(context);
  }
}
