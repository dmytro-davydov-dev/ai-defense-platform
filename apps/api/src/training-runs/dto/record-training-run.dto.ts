import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { EvaluationReportDto } from "./evaluation-report.dto";

/**
 * REQ-8.7: submitted once by `apps/vision-service`'s training script
 * (`training/registry_client.py`) after a run completes or fails — this
 * is a one-shot record, not an incremental/streaming update (Section 6
 * of docs/mvp-plan/PRD-Phase-8.md deliberately keeps this simple: a
 * batch training job, not a long-running service with partial state).
 */
export class RecordTrainingRunDto {
  @ApiProperty() @IsString() datasetId!: string;
  @ApiProperty() @IsString() datasetSplitId!: string;

  @ApiPropertyOptional({ example: "a1b2c3d" })
  @IsOptional()
  @IsString()
  gitCommit?: string;

  @ApiProperty({ example: { epochs: 50, batchSize: 16, learningRate: 0.01 } })
  @IsObject()
  hyperparameters!: Record<string, unknown>;

  @ApiProperty({ enum: ["COMPLETED", "FAILED"] })
  @IsIn(["COMPLETED", "FAILED"])
  status!: "COMPLETED" | "FAILED";

  @ApiProperty({
    example: { finalLoss: 0.042, epochsRun: 50 },
    description: "Per-epoch or summary metrics — shape is producer-defined.",
  })
  @IsObject()
  metrics!: Record<string, unknown>;

  @ApiPropertyOptional({
    type: EvaluationReportDto,
    description: "Required when status is COMPLETED (REQ-8.8).",
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => EvaluationReportDto)
  evaluationReport?: EvaluationReportDto;

  @ApiProperty() @IsDateString() startedAt!: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString() completedAt?: string;
}
