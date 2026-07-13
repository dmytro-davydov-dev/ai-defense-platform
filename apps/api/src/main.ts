import { NestFactory } from "@nestjs/core";
import { log } from "@ai-defense/observability";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env["PORT"] ?? 3000);
  await app.listen(port);
  log("info", `api listening on ${port}`);
}
void bootstrap();
