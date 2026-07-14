import type { RoleName } from "../roles/roles.constants";

/** Shape encoded into every issued JWT (REQ-2.4). */
export interface JwtPayload {
  sub: string;
  email: string;
  roles: RoleName[];
}

/** What `JwtStrategy.validate()` attaches to `request.user` after a token verifies. */
export interface AuthenticatedUser {
  userId: string;
  email: string;
  roles: RoleName[];
}
