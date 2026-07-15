import { Injectable, NotFoundException } from "@nestjs/common";
import { TrainingRunsRepository } from "./training-runs.repository";
import {
  TrainingRunValidationError,
  type RecordTrainingRunInput,
  type TrainingRunRecord,
} from "./training-run.types";

/**
 * PRD-Phase-8 REQ-8.7/8.8/8.13/8.14: the experiment-tracking write path
 * `apps/vision-service`'s training script calls once per run, and the
 * read path `GET /training-runs(/:id)` serves.
 */
@Injectable()
export class TrainingRunsService {
  constructor(
    private readonly trainingRunsRepository: TrainingRunsRepository,
  ) {}

  async record(input: RecordTrainingRunInput): Promise<TrainingRunRecord> {
    if (input.status === "COMPLETED") {
      this.assertWellFormedEvaluationReport(input);
    }
    return this.trainingRunsRepository.insert(input);
  }

  async listAll(datasetId?: string): Promise<TrainingRunRecord[]> {
    return this.trainingRunsRepository.findAll(datasetId);
  }

  async getById(id: string): Promise<TrainingRunRecord> {
    const run = await this.trainingRunsRepository.findById(id);
    if (!run) {
      throw new NotFoundException(`training run ${id} not found`);
    }
    return run;
  }

  /**
   * REQ-8.8/8.13/8.14: a COMPLETED run must carry a report with at
   * least one per-class metric — an empty or missing report would
   * silently defeat the whole point of REQ-8.13's "flag low performers"
   * requirement. `flaggedClasses`/`failureNotes` may legitimately be
   * empty arrays (a run with no flagged classes or no known failure
   * cases is a valid, good outcome), so only their *presence* as arrays
   * is checked, not their length.
   */
  private assertWellFormedEvaluationReport(
    input: RecordTrainingRunInput,
  ): void {
    const report = input.evaluationReport;
    if (!report) {
      throw new TrainingRunValidationError(
        "a COMPLETED training run requires an evaluationReport (REQ-8.8)",
      );
    }
    if (!Array.isArray(report.perClass) || report.perClass.length === 0) {
      throw new TrainingRunValidationError(
        "evaluationReport.perClass must be a non-empty array (REQ-8.8: per-class precision/recall/mAP)",
      );
    }
    if (!Array.isArray(report.flaggedClasses)) {
      throw new TrainingRunValidationError(
        "evaluationReport.flaggedClasses must be an array, even if empty (REQ-8.13)",
      );
    }
    if (!Array.isArray(report.failureNotes)) {
      throw new TrainingRunValidationError(
        "evaluationReport.failureNotes must be an array, even if empty (REQ-8.14)",
      );
    }
  }
}
