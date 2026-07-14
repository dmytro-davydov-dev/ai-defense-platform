import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { AuthenticatedUser, JwtPayload } from "./auth.types";

/**
 * REQ-2.4: verifies the JWTs `AuthService.issueToken` signs. Stateless —
 * no DB lookup per request; the token's `roles` claim (set at issuance
 * time) is trusted for the token's lifetime, per the PRD's "JWT issued/
 * verified by apps/api itself is sufficient for Phase 2" non-goal on
 * full OIDC. A role change takes effect on the user's next login.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const secret = process.env["JWT_SECRET"];
    if (!secret) {
      throw new Error("JWT_SECRET must be set (see .env.example)");
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    if (!payload.sub || !payload.email) {
      throw new UnauthorizedException("AUTH_INVALID_TOKEN_PAYLOAD");
    }
    return { userId: payload.sub, email: payload.email, roles: payload.roles };
  }
}
