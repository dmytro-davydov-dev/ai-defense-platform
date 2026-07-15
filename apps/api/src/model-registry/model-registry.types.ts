/**
 * PRD-Phase-8 (docs/mvp-plan/PRD-Phase-8.md) REQ-8.9-8.12: the model
 * registry. Mirrors `model_versions`' columns (see schema.prisma's
 * `ModelVersion` model comment for the stale-generated-client reason
 * this uses `$queryRaw`/`$executeRaw` rather than a delegate).
 */
export type ModelStage = "CANDIDATE" | "STAGED" | "PRODUCTION" | "RETIRED";

export interface RegisterModelInput {
  readonly trainingRunId: string;
  readonly objectKey: string;
}

export interface ModelVersionRecord {
  readonly id: string;
  readonly trainingRunId: string;
  readonly objectKey: string;
  readonly stage: ModelStage;
  readonly createdAt: Date;
  readonly promotedAt: Date | null;
  readonly promotedById: string | null;
}

/** REQ-8.9: thrown when registering a model against a training run that isn't COMPLETED — an unfinished or failed run has no artifact fit to register. */
export class ModelRegistryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelRegistryValidationError";
  }
}
