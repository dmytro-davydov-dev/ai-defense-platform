import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { TrainingRunsModule } from "../training-runs/training-runs.module";
import { EdgeAuthModule } from "../edge-auth/edge-auth.module";
import { ModelRegistryController } from "./model-registry.controller";
import { ModelRegistryService } from "./model-registry.service";
import { ModelRegistryRepository } from "./model-registry.repository";

/**
 * PRD-Phase-8 (docs/mvp-plan/PRD-Phase-8.md) REQ-8.9-8.12: model
 * registry, promotion, and rollback. Imports `TrainingRunsModule` to
 * validate a training run is COMPLETED before registering a model
 * against it (REQ-8.9), and `AuditModule` to record every promotion/
 * rollback (REQ-8.12) via the existing REQ-2.10 audit trail.
 *
 * Note: promote/rollback are deliberately restricted to the `admin`
 * role only (not `operator`) in `ModelRegistryController` — a stricter
 * gate than this phase's own Open Questions minimum ("reuse
 * operator/admin"), reflecting that changing which model runs in
 * production is a higher-consequence action than mission CRUD.
 *
 * EdgeAuthModule: GET /models/production accepts JwtOrDeviceAuthGuard
 * (Phase 9 REQ-9.13) alongside its existing JwtAuthGuard route.
 */
@Module({
  imports: [TrainingRunsModule, AuditModule, EdgeAuthModule],
  controllers: [ModelRegistryController],
  providers: [ModelRegistryService, ModelRegistryRepository],
  exports: [ModelRegistryService],
})
export class ModelRegistryModule {}
