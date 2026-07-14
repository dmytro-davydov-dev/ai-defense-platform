import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { UsersService } from "../users/users.service";
import { RolesService } from "../roles/roles.service";
import { AuditService } from "../audit/audit.service";
import { ROLE_NAMES, type RoleName } from "../roles/roles.constants";
import type { AuthResponseDto } from "./dto/auth-response.dto";
import type { LoginDto } from "./dto/login.dto";
import type { RegisterDto } from "./dto/register.dto";
import type { JwtPayload } from "./auth.types";
import type { UserRecord } from "../users/user.types";
import { getJwtExpiresInSeconds } from "./jwt-expiry.util";

const BCRYPT_SALT_ROUNDS = 10;

interface AuthEventContext {
  correlationId?: string | null | undefined;
}

/**
 * REQ-2.4: registration/login, bcrypt password hashing, JWT issuance.
 * REQ-2.6: every auth event (register, login success/failure, token
 * issuance) writes an audit record via AuditService.
 *
 * Password hashing: bcrypt (10 salt rounds), chosen over argon2 for
 * Phase 2 because it needs no native build config beyond the `bcrypt`
 * package's own prebuilt binary and is the more battle-tested default
 * for a Node/NestJS stack — recorded here inline per PRD-Phase-2 §7
 * ("password hashing algorithm ... recorded inline in AuthModule's
 * code/README rather than a standalone ADR").
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
    private readonly auditService: AuditService,
    private readonly jwtService: JwtService,
  ) {}

  async register(
    dto: RegisterDto,
    ctx: AuthEventContext = {},
  ): Promise<AuthResponseDto> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException("AUTH_EMAIL_ALREADY_REGISTERED");
    }

    const passwordHash = await this.hashPassword(dto.password);
    const roleIds = await this.rolesService.getIdsByNames([
      ROLE_NAMES.OPERATOR,
    ]);

    const user = await this.usersService.createUser({
      email: dto.email,
      passwordHash,
      displayName: dto.displayName,
      roleIds,
    });

    await this.auditService.record({
      actorUserId: user.id,
      action: "auth.register",
      targetType: "user",
      targetId: user.id,
      correlationId: ctx.correlationId,
    });

    return this.issueTokenAndAudit(user, ctx);
  }

  async login(
    dto: LoginDto,
    ctx: AuthEventContext = {},
  ): Promise<AuthResponseDto> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      await this.auditService.record({
        action: "auth.login_failed",
        targetType: "user",
        metadata: { email: dto.email, reason: "user_not_found" },
        correlationId: ctx.correlationId,
      });
      throw new UnauthorizedException("AUTH_INVALID_CREDENTIALS");
    }

    const passwordValid = await this.verifyPassword(
      dto.password,
      user.passwordHash,
    );
    if (!passwordValid) {
      await this.auditService.record({
        actorUserId: user.id,
        action: "auth.login_failed",
        targetType: "user",
        targetId: user.id,
        metadata: { reason: "invalid_password" },
        correlationId: ctx.correlationId,
      });
      throw new UnauthorizedException("AUTH_INVALID_CREDENTIALS");
    }

    await this.auditService.record({
      actorUserId: user.id,
      action: "auth.login_success",
      targetType: "user",
      targetId: user.id,
      correlationId: ctx.correlationId,
    });

    return this.issueTokenAndAudit(user, ctx);
  }

  private async issueTokenAndAudit(
    user: UserRecord,
    ctx: AuthEventContext,
  ): Promise<AuthResponseDto> {
    const roles = user.roles as RoleName[];
    const payload: JwtPayload = { sub: user.id, email: user.email, roles };
    const accessToken = this.jwtService.sign(payload);
    const expiresInSeconds = getJwtExpiresInSeconds();

    await this.auditService.record({
      actorUserId: user.id,
      action: "auth.token_issued",
      targetType: "user",
      targetId: user.id,
      correlationId: ctx.correlationId,
    });

    return {
      accessToken,
      expiresInSeconds,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles: user.roles,
      },
    };
  }

  hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  }

  verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
