/**
 * REQ-2.12 (docs/mvp-plan/PRD-Phase-2.md): exports the same OpenAPI
 * document that `/docs` serves (see `src/main.ts`, REQ-2.11) into
 * `packages/contracts/openapi.json`, so Phase 6's frontend can point
 * `@rtk-query/codegen-openapi` (or an equivalent generator) at a
 * committed file instead of a live `apps/api` instance.
 *
 * Deliberately never calls `app.init()`/`app.listen()`: Nest's
 * `OnModuleInit` lifecycle hooks (which is where `PrismaService` opens
 * its Postgres connection and `StorageService` creates its MinIO
 * bucket — see `src/prisma/prisma.service.ts` and
 * `src/storage/storage.service.ts`) only fire on those calls, not on
 * `NestFactory.create()` alone. `SwaggerModule.createDocument()` only
 * needs each provider's constructor to have run (for Nest to resolve
 * the DI graph and read controller/DTO decorator metadata), so this
 * script runs with no real Postgres or MinIO reachable — matching how
 * REQ-2.14's integration-test gap does *not* apply here. Placeholder
 * env values below only need to satisfy the constructors' "fail loudly
 * if unset" guards (REQ-1.18-style), never an actual connection.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

// Run from apps/api (pnpm sets cwd to the package directory for
// package.json scripts), so this resolves to <repo root>/packages/contracts
// regardless of whether this file is executed from source or from dist/.
const OUTPUT_PATH = path.resolve(
  process.cwd(),
  "../../packages/contracts/openapi.json",
);

function ensurePlaceholderEnv(): void {
  process.env["DATABASE_URL"] ??=
    "postgresql://placeholder:placeholder@localhost:5432/placeholder";
  process.env["MINIO_ROOT_USER"] ??= "placeholder";
  process.env["MINIO_ROOT_PASSWORD"] ??= "placeholder";
  process.env["JWT_SECRET"] ??= "placeholder-openapi-export-secret";
}

async function main(): Promise<void> {
  ensurePlaceholderEnv();

  // Deliberately a dynamic import, not a static top-level one: static
  // imports are hoisted and evaluated before this function body runs,
  // but AuthModule's @Module() decorator calls getRequiredJwtSecret()
  // directly inside its `imports` array — at module-evaluation time,
  // not DI-instantiation time. A static `import { AppModule } from
  // "../src/app.module"` above would load (and throw inside)
  // AuthModule before ensurePlaceholderEnv() ever ran. Safe to defer
  // like this because this script runs via plain `node` after `nest
  // build`, never under Jest — the "invoked without
  // --experimental-vm-modules" restriction on dynamic import() is a
  // Jest-specific limitation (package.json's test:e2e script sets that
  // flag for the unrelated reason of Prisma's own internal WASM-loader
  // dynamic import — see docs/roadmap/Progress.md Known gaps) that
  // doesn't apply to plain `node`. The explicit ".js" extension is
  // required, not optional: tsconfig's "moduleResolution": "nodenext"
  // demands it on every relative specifier (the same convention
  // Prisma's own generated client uses internally, e.g.
  // "./internal/class.js" — see the test/jest-e2e.json fix above) so
  // it can map the specifier to this file's *compiled* location
  // (dist/src/app.module.js) rather than the .ts source.
  const { AppModule } = await import("../src/app.module.js");

  const app = await NestFactory.create(AppModule, { logger: false });

  // Mirrors src/main.ts's DocumentBuilder config exactly (REQ-2.11) —
  // any drift between the two would mean /docs and the exported spec
  // disagree.
  const config = new DocumentBuilder()
    .setTitle("AI Defense Platform API")
    .setDescription(
      "Control-plane API — mission lifecycle, identity, upload, audit.",
    )
    .setVersion("0.1.0")
    .build();
  const document = SwaggerModule.createDocument(app, config);

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(document, null, 2)}\n`);

  // eslint-disable-next-line no-console -- CLI script, not app runtime logging
  console.log(`OpenAPI spec written to ${OUTPUT_PATH}`);

  await app.close();
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console -- CLI script, not app runtime logging
  console.error(error);
  process.exitCode = 1;
});
