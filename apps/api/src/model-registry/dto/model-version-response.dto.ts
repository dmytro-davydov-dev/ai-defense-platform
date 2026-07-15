import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type { ModelVersionRecord } from "../model-registry.types";

export class ModelVersionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() trainingRunId!: string;
  @ApiProperty() objectKey!: string;
  @ApiProperty({ enum: ["CANDIDATE", "STAGED", "PRODUCTION", "RETIRED"] })
  stage!: string;
  @ApiProperty() createdAt!: string;
  @ApiPropertyOptional({ nullable: true }) promotedAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) promotedById!: string | null;

  static fromRecord(record: ModelVersionRecord): ModelVersionResponseDto {
    const dto = new ModelVersionResponseDto();
    dto.id = record.id;
    dto.trainingRunId = record.trainingRunId;
    dto.objectKey = record.objectKey;
    dto.stage = record.stage;
    dto.createdAt = record.createdAt.toISOString();
    dto.promotedAt = record.promotedAt ? record.promotedAt.toISOString() : null;
    dto.promotedById = record.promotedById;
    return dto;
  }
}
