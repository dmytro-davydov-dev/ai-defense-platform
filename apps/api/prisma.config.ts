// Prisma 7 CLI configuration (migrate, generate, studio). Runtime
// PrismaClient connection is configured separately in
// src/prisma/prisma.service.ts via @prisma/adapter-pg, per
// docs/adr/ADR-004-nestjs-orm.md.
import "dotenv/config";
import { defineConfig } from "prisma/config";

// Plain process.env read (not the `env()` helper, which throws if the
// variable is missing) so commands that don't touch a live database —
// `prisma generate`, `prisma migrate diff --from-empty` — still work
// without a `.env` file present. `prisma migrate dev`/`deploy` fail
// with a clear connection error if DATABASE_URL is genuinely missing
// at that point instead. Bracket access (not `.DATABASE_URL`) per this
// project's `noPropertyAccessFromIndexSignature` TS setting.
const databaseUrl: string | undefined = process.env["DATABASE_URL"];

export default defineConfig({
  schema: "./prisma/schema.prisma",
  migrations: {
    path: "./prisma/migrations",
  },
  // `exactOptionalPropertyTypes` means `datasource.url` must be omitted
  // entirely rather than set to `undefined` when DATABASE_URL isn't set.
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
});
