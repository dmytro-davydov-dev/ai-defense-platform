import { SetMetadata } from "@nestjs/common";
import type { RoleName } from "../../roles/roles.constants";

export const ROLES_KEY = "roles";

/**
 * REQ-2.5: marks a route as requiring at least one of the given roles.
 * Read by `RolesGuard`. A route with no `@Roles(...)` decorator is only
 * gated by `JwtAuthGuard` (authenticated, any role) — see
 * `Security_Baseline.md` for which routes currently carry which guards.
 */
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);
