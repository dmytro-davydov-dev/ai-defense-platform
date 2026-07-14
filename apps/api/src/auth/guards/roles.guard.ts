import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../decorators/roles.decorator";
import type { RoleName } from "../../roles/roles.constants";
import type { AuthenticatedUser } from "../auth.types";

/**
 * REQ-2.5: enforces `@Roles(...)` on a route. Must run after
 * `JwtAuthGuard` (relies on `request.user` already being populated) —
 * always pair as `@UseGuards(JwtAuthGuard, RolesGuard)`, guard order
 * matters in Nest (`@UseGuards` runs guards left to right).
 *
 * A route with no `@Roles(...)` metadata passes this guard unconditionally
 * — it's still gated by `JwtAuthGuard` alone (authenticated, any role).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<
      RoleName[] | undefined
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      // JwtAuthGuard should have rejected this already; treat as
      // forbidden rather than trusting an unauthenticated request.
      throw new ForbiddenException("AUTH_ROLE_CHECK_NO_USER");
    }

    const hasRequiredRole = requiredRoles.some((role) =>
      user.roles.includes(role),
    );
    if (!hasRequiredRole) {
      throw new ForbiddenException("AUTH_INSUFFICIENT_ROLE");
    }
    return true;
  }
}
