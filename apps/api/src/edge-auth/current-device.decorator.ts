import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AuthenticatedDevice } from "./device-auth.types";

/** Reads the `AuthenticatedDevice` `DeviceAuthGuard` attached to the request. Use after `@UseGuards(DeviceAuthGuard)` (or `JwtOrDeviceAuthGuard` when the caller authenticated as a device). Mirrors `@CurrentUser()`. */
export const CurrentDevice = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedDevice | undefined => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ device?: AuthenticatedDevice }>();
    return request.device;
  },
);
