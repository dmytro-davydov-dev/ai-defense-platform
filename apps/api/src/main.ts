import { config } from "dotenv";

// Plain `import "dotenv/config"` (as prisma.config.ts uses) only loads
// `.env` from process.cwd() — it does not pick up `.env.local`. Loaded
// explicitly here, cwd-relative (not `__dirname`-relative, which
// differs between `nest start` dev and the compiled `dist/src/main.js`
// prod build), matching the Docker WORKDIR (apps/api) and local dev
// cwd. Local-only convenience file, gitignored; unset vars still fall
// through to the shell/Compose environment.
//
// Must run before the `./app.module` import below: TS's CommonJS emit
// preserves source order rather than hoisting imports, but modules
// like AuthModule read `process.env.JWT_SECRET` at module-load time
// (src/auth/jwt-expiry.util.ts), so dotenv has to be loaded first or
// that read sees an empty environment and throws.
config({ path: "./.env.local" });

import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { log } from "@ai-defense/observability";
import { AppModule } from "./app.module";

/** `.env.example`-documented vars ship blank rather than absent (REQ-1.18's committed-example convention), so `??` alone won't fall through — treat `""` the same as unset. */
function nonEmptyEnv(value: string | undefined): string | undefined {
  return value !== undefined && value.trim().length > 0 ? value : undefined;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // apps/web (Vite dev server) is a different origin than apps/api, so
  // the browser preflights every mutating request. Without this, Nest
  // has no OPTIONS handler at all and the preflight 404s before the
  // CORS check can even run. Auth is a stateless JWT sent via
  // `Authorization` header (docs/security/Security_Baseline.md) — no
  // cookies involved — so credentials don't need to be enabled here.
  const corsOrigins = (
    nonEmptyEnv(process.env["CORS_ORIGIN"]) ??
    `http://localhost:${process.env["WEB_PORT"] ?? 5173}`
  )
    .split(",")
    .map((origin) => origin.trim());
  app.enableCors({ origin: corsOrigins });

  // REQ-2.7: every controller input is DTO-validated; class-validator
  // decorators on the DTOs do the real work, this just wires it in
  // globally so no future controller can forget the pipe.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // REQ-2.11: OpenAPI spec + Swagger UI at /docs.
  const config = new DocumentBuilder()
    .setTitle("AI Defense Platform API")
    .setDescription(
      "Control-plane API — mission lifecycle, identity, upload, audit.",
    )
    .setVersion("0.1.0")
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, documentFactory);

  const port = Number(process.env["PORT"] ?? 3000);
  await app.listen(port);
  log("info", `api listening on ${port}`);
}
void bootstrap();
