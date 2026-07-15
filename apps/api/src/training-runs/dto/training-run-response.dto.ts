import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type { TrainingRunRecord } from "../training-run.types";

export class TrainingRunResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() datasetId!: string;
  @ApiProperty() datasetSplitId!: string;
  @ApiPropertyOptional({ nullable: true }) gitCommit!: string | null;
  @ApiProperty() hyperparameters!: Record<string, unknown>;
  @ApiProperty({ enum: ["COMPLETED", "FAILED"] }) status!: string;
  @ApiProperty() metrics!: Record<string, unknown>;
  @ApiPropertyOptional({ nullable: true }) evaluationReport!: unknown;
  @ApiProperty() startedAt!: string;
  @ApiPropertyOptional({ nullable: true }) completedAt!: string | null;
  @ApiProperty() createdAt!: string;

  static fromRecord(record: TrainingRunRecord): TrainingRunResponseDto {
    const dto = new TrainingRunResponseDto();
    dto.id = record.id;
    dto.datasetId = record.datasetId;
    dto.datasetSplitId = record.datasetSplitId;
    dto.gitCommit = record.gitCommit;
    dto.hyperparameters = record.hyperparameters;
    dto.status = record.status;
    dto.metrics = record.metrics;
    dto.evaluationReport = record.evaluationReport;
    dto.startedAt = record.startedAt.toISOString();
    dto.completedAt = record.completedAt
      ? record.completedAt.toISOString()
      : null;
    dto.createdAt = record.createdAt.toISOString();
    return dto;
  }
}
