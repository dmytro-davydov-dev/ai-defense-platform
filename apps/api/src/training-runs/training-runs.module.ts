import { Module } from "@nestjs/common";
import { TrainingRunsController } from "./training-runs.controller";
import { TrainingRunsService } from "./training-runs.service";
import { TrainingRunsRepository } from "./training-runs.repository";

/**
 * PRD-Phase-8 (docs/mvp-plan/PRD-Phase-8.md) REQ-8.7/8.8/8.13/8.14:
 * the in-house experiment tracker
 * (docs/adr/ADR-008-experiment-tracking-and-dataset-versioning.md).
 * Exports `TrainingRunsService` so `ModelRegistryModule` can look up a
 * training run's lineage when registering a model version (REQ-8.9).
 */
@Module({
  controllers: [TrainingRunsController],
  providers: [TrainingRunsService, TrainingRunsRepository],
  exports: [TrainingRunsService],
})
export class TrainingRunsModule {}
