import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

/**
 * Global so every feature module (Auth, User, Mission, Audit) can inject
 * `PrismaService` without re-importing this module everywhere — the
 * connection itself is still a single instance managed by Nest's DI
 * lifecycle (see PrismaService's onModuleInit/onModuleDestroy).
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
