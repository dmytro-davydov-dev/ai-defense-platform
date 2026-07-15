import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { DatasetsController } from "./datasets.controller";
import { DatasetsService } from "./datasets.service";
import { DatasetsRepository } from "./datasets.repository";

/**
 * PRD-Phase-8 (docs/mvp-plan/PRD-Phase-8.md) REQ-8.1-8.3: dataset
 * registry and split generation, a standalone platform-level module —
 * not imported into `MissionsModule`, since datasets/splits are not
 * mission-scoped. Imports `StorageModule` for the MinIO writes
 * `DatasetsService.generateSplit()` makes (split manifests).
 */
@Module({
  imports: [StorageModule],
  controllers: [DatasetsController],
  providers: [DatasetsService, DatasetsRepository],
  exports: [DatasetsService],
})
export class DatasetsModule {}
