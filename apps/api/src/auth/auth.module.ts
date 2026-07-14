import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { UsersModule } from "../users/users.module";
import { RolesModule } from "../roles/roles.module";
import { AuditModule } from "../audit/audit.module";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy } from "./jwt.strategy";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { RolesGuard } from "./guards/roles.guard";
import {
  getJwtExpiresInSeconds,
  getRequiredJwtSecret,
} from "./jwt-expiry.util";

@Module({
  imports: [
    UsersModule,
    RolesModule,
    AuditModule,
    PassportModule,
    JwtModule.register({
      secret: getRequiredJwtSecret(),
      signOptions: { expiresIn: getJwtExpiresInSeconds() },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard, RolesGuard],
  exports: [AuthService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
