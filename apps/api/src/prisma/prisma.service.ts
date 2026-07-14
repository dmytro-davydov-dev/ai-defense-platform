import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

/**
 * Wraps the generated Prisma client behind Nest's DI/lifecycle, per
 * ADR-004-nestjs-orm.md and the comment at the top of
 * apps/api/prisma.config.ts: the CLI (generate/migrate) reads its
 * connection string from prisma.config.ts, but the runtime client only
 * ever receives DATABASE_URL explicitly here, via the @prisma/adapter-pg
 * driver adapter — schema.prisma's datasource block intentionally has no
 * `url` field.
 *
 * Every controller/service in this app that needs the database goes
 * through a repository that injects this service — nothing imports
 * `@prisma/client`/the generated client directly outside `src/prisma/`
 * and each module's repository, per Coding_Standards.md's "repositories
 * hide persistence details" rule.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const databaseUrl = process.env["DATABASE_URL"];
    if (!databaseUrl) {
      // Fail loudly rather than letting Prisma throw an opaque error on
      // the first query — consistent with StorageService's guard on
      // MINIO_ROOT_USER/PASSWORD (REQ-1.18-style "no silent blank
      // credential" behavior).
      throw new Error("DATABASE_URL must be set (see .env.example)");
    }

    super({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log("Connected to Postgres via @prisma/adapter-pg");
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
