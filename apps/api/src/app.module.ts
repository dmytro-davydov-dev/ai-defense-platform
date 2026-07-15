import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { HealthController } from "./health/health.controller";
import { StorageModule } from "./storage/storage.module";
import { PrismaModule } from "./prisma/prisma.module";
import { AuditModule } from "./audit/audit.module";
import { RolesModule } from "./roles/roles.module";
import { UsersModule } from "./users/users.module";
import { AuthModule } from "./auth/auth.module";
import { MissionsModule } from "./missions/missions.module";
import { KafkaModule } from "./kafka/kafka.module";
import { DatasetsModule } from "./datasets/datasets.module";
import { TrainingRunsModule } from "./training-runs/training-runs.module";
import { ModelRegistryModule } from "./model-registry/model-registry.module";
import { EdgeAuthModule } from "./edge-auth/edge-auth.module";
import { EdgeModule } from "./edge/edge.module";

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    RolesModule,
    UsersModule,
    AuthModule,
    MissionsModule,
    StorageModule,
    KafkaModule,
    // PRD-Phase-8 (docs/mvp-plan/PRD-Phase-8.md): platform-level MLOps
    // modules, not mission-scoped — registered alongside MissionsModule
    // rather than nested inside it.
    DatasetsModule,
    TrainingRunsModule,
    ModelRegistryModule,
    // PRD-Phase-9 (docs/mvp-plan/PRD-Phase-9.md): edge device identity
    // guards and device registry/event-ingestion, platform-level like
    // the Phase 8 modules above.
    EdgeAuthModule,
    EdgeModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
