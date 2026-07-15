/**
 * PRD-Phase-8 (docs/mvp-plan/PRD-Phase-8.md) REQ-8.7/8.8/8.13/8.14:
 * one row per training run — the in-house "experiment tracker"
 * docs/adr/ADR-008-experiment-tracking-and-dataset-versioning.md
 * decided to build rather than adopt MLflow. Written once by
 * `apps/vision-service`'s training script
 * (`training/registry_client.py`) after a run completes or fails.
 */
export interface EvaluationClassMetric {
  readonly label: string;
  readonly precision: number;
  readonly recall: number;
  readonly averagePrecision: number;
  readonly supportCount: number;
}

/**
 * REQ-8.8/8.13/8.14: per-class metrics plus the two report sections the
 * risk register's "Model accuracy is mistaken for certainty" mitigation
 * ("Show confidence, provenance and review requirements") requires as
 * first-class, not buried in an aggregate number — `flaggedClasses`
 * (REQ-8.13) and `failureNotes` (REQ-8.14).
 */
export interface EvaluationReport {
  readonly meanAveragePrecision: number;
  readonly perClass: readonly EvaluationClassMetric[];
  readonly flaggedClasses: readonly string[];
  readonly failureNotes: readonly string[];
}

export type TrainingRunStatus = "COMPLETED" | "FAILED";

export interface RecordTrainingRunInput {
  readonly datasetId: string;
  readonly datasetSplitId: string;
  readonly gitCommit?: string | null | undefined;
  readonly hyperparameters: Record<string, unknown>;
  readonly status: TrainingRunStatus;
  readonly metrics: Record<string, unknown>;
  readonly evaluationReport?: EvaluationReport | null | undefined;
  readonly startedAt: Date;
  readonly completedAt?: Date | null | undefined;
}

export interface TrainingRunRecord {
  readonly id: string;
  readonly datasetId: string;
  readonly datasetSplitId: string;
  readonly gitCommit: string | null;
  readonly hyperparameters: Record<string, unknown>;
  readonly status: TrainingRunStatus;
  readonly metrics: Record<string, unknown>;
  readonly evaluationReport: EvaluationReport | null;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
  readonly createdAt: Date;
}

/** REQ-8.8: thrown when a COMPLETED run is recorded without a well-formed evaluation report — a training run this platform can't produce bias/failure visibility for is not allowed to silently register as done. */
export class TrainingRunValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrainingRunValidationError";
  }
}
