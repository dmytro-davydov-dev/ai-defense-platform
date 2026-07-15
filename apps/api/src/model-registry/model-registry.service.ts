import { Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import type { PrismaExecutor } from "../prisma/prisma.types";
import { TrainingRunsService } from "../training-runs/training-runs.service";
import { ModelRegistryRepository } from "./model-registry.repository";
import {
  ModelRegistryValidationError,
  type ModelVersionRecord,
  type RegisterModelInput,
} from "./model-registry.types";

/**
 * PRD-Phase-8 (docs/mvp-plan/PRD-Phase-8.md) REQ-8.9-8.12: model
 * registry, promotion, and rollback. Every stage change (`promote`/
 * `rollback`) is audited (REQ-8.12) via the same `AuditService` REQ-2.10
 * already established — this is not a parallel audit mechanism.
 */
@Injectable()
export class ModelRegistryService {
  constructor(
    private readonly modelRegistryRepository: ModelRegistryRepository,
    private readonly trainingRunsService: TrainingRunsService,
    private readonly auditService: AuditService,
  ) {}

  /** REQ-8.9: registers an exported `.onnx` artifact against the COMPLETED training run that produced it. */
  async register(input: RegisterModelInput): Promise<ModelVersionRecord> {
    const trainingRun = await this.trainingRunsService.getById(
      input.trainingRunId,
    );
    if (trainingRun.status !== "COMPLETED") {
      throw new ModelRegistryValidationError(
        `training run ${input.trainingRunId} is not COMPLETED (status: ${trainingRun.status}) — only a completed run's artifact can be registered`,
      );
    }
    return this.modelRegistryRepository.insert(input);
  }

  async listAll(): Promise<ModelVersionRecord[]> {
    return this.modelRegistryRepository.findAll();
  }

  async getById(id: string): Promise<ModelVersionRecord> {
    const model = await this.modelRegistryRepository.findById(id);
    if (!model) {
      throw new NotFoundException(`model version ${id} not found`);
    }
    return model;
  }

  /**
   * REQ-8.10: `apps/vision-service`'s detector factory resolves its
   * active model from this endpoint's result when
   * `VISION_SERVICE_DETECTION_MODEL_PATH` is unset (see
   * `detection/factory.py`'s Phase 8 addition) — returns `null` if no
   * model has ever been promoted, the same "disabled, not broken"
   * default `NullDetectorAdapter` already represents.
   */
  async getProduction(): Promise<ModelVersionRecord | null> {
    return this.modelRegistryRepository.findProduction();
  }

  /**
   * REQ-8.10: promotes `id` to PRODUCTION, demoting whatever was
   * PRODUCTION before (if anything) to STAGED — never RETIRED, so a
   * demoted model remains a valid `POST /models/rollback` target. No
   * code change to `apps/vision-service` is required for this to take
   * effect; a restart re-resolves the production model at startup (see
   * `detection/factory.py`), consistent with REQ-8.10's own "at
   * startup" wording and this phase's non-goal against fully automated
   * redeployment.
   */
  async promote(
    id: string,
    actorUserId: string | undefined,
  ): Promise<ModelVersionRecord> {
    return this.transitionProduction(id, actorUserId, "model.promoted");
  }

  /**
   * REQ-8.11: reverts the active production reference to a prior
   * registered production version — either the explicit `toVersionId`
   * given, or (if omitted) the most recently demoted former-production
   * model, i.e. "undo the last promotion."
   */
  async rollback(
    actorUserId: string | undefined,
    toVersionId?: string,
  ): Promise<ModelVersionRecord> {
    if (toVersionId) {
      return this.transitionProduction(
        toVersionId,
        actorUserId,
        "model.rolled_back",
      );
    }

    return this.modelRegistryRepository.runInTransaction(async (tx) => {
      const currentProduction =
        await this.modelRegistryRepository.findProduction(tx);
      const target =
        await this.modelRegistryRepository.findMostRecentlyDemotedProduction(
          currentProduction?.id ?? null,
          tx,
        );
      if (!target) {
        throw new NotFoundException(
          "no prior production model version to roll back to",
        );
      }
      return this.applyProductionTransition(
        target.id,
        currentProduction,
        actorUserId,
        "model.rolled_back",
        tx,
      );
    });
  }

  private async transitionProduction(
    id: string,
    actorUserId: string | undefined,
    auditAction: "model.promoted" | "model.rolled_back",
  ): Promise<ModelVersionRecord> {
    return this.modelRegistryRepository.runInTransaction(async (tx) => {
      const target = await this.modelRegistryRepository.findById(id, tx);
      if (!target) {
        throw new NotFoundException(`model version ${id} not found`);
      }
      const currentProduction =
        await this.modelRegistryRepository.findProduction(tx);
      return this.applyProductionTransition(
        id,
        currentProduction,
        actorUserId,
        auditAction,
        tx,
      );
    });
  }

  private async applyProductionTransition(
    targetId: string,
    currentProduction: ModelVersionRecord | null,
    actorUserId: string | undefined,
    auditAction: "model.promoted" | "model.rolled_back",
    tx: PrismaExecutor,
  ): Promise<ModelVersionRecord> {
    if (currentProduction && currentProduction.id !== targetId) {
      await this.modelRegistryRepository.setStage(
        currentProduction.id,
        "STAGED",
        null,
        tx,
      );
    }
    const promotedAt = new Date();
    await this.modelRegistryRepository.setStage(
      targetId,
      "PRODUCTION",
      { promotedAt, promotedById: actorUserId ?? null },
      tx,
    );
    await this.auditService.record(
      {
        actorUserId: actorUserId ?? null,
        action: auditAction,
        targetType: "model_version",
        targetId,
        metadata: {
          fromModelId: currentProduction?.id ?? null,
          toModelId: targetId,
        },
      },
      tx,
    );
    const updated = await this.modelRegistryRepository.findById(targetId, tx);
    if (!updated) {
      throw new Error(`model version ${targetId} vanished mid-transaction`);
    }
    return updated;
  }
}
