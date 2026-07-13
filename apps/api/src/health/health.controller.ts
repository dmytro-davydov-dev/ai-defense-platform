import { Controller, Get, HttpCode } from "@nestjs/common";

/**
 * Liveness/readiness endpoints — Phase 1 (docs/mvp-plan/PRD-Phase-1.md,
 * REQ-1.8). `/health` reports process liveness; `/ready` will start
 * checking real dependencies (Postgres, Kafka) once Phase 2/3 wire them
 * in. Both return 200 today because the shell has no dependencies yet.
 */
@Controller()
export class HealthController {
  @Get("health")
  @HttpCode(200)
  getHealth(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("ready")
  @HttpCode(200)
  getReady(): { status: "ready" } {
    return { status: "ready" };
  }
}
