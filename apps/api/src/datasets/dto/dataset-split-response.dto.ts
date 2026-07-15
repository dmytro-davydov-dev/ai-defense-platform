import { ApiProperty } from "@nestjs/swagger";
import type { DatasetSplitRecord } from "../dataset.types";

export class DatasetSplitResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() datasetId!: string;
  @ApiProperty() seed!: number;
  @ApiProperty() trainRatio!: number;
  @ApiProperty() validationRatio!: number;
  @ApiProperty() testRatio!: number;
  @ApiProperty() trainCount!: number;
  @ApiProperty() validationCount!: number;
  @ApiProperty() testCount!: number;
  @ApiProperty() trainManifestObjectKey!: string;
  @ApiProperty() validationManifestObjectKey!: string;
  @ApiProperty() testManifestObjectKey!: string;
  @ApiProperty() createdAt!: string;

  static fromRecord(record: DatasetSplitRecord): DatasetSplitResponseDto {
    const dto = new DatasetSplitResponseDto();
    dto.id = record.id;
    dto.datasetId = record.datasetId;
    dto.seed = record.seed;
    dto.trainRatio = record.trainRatio;
    dto.validationRatio = record.validationRatio;
    dto.testRatio = record.testRatio;
    dto.trainCount = record.trainCount;
    dto.validationCount = record.validationCount;
    dto.testCount = record.testCount;
    dto.trainManifestObjectKey = record.trainManifestObjectKey;
    dto.validationManifestObjectKey = record.validationManifestObjectKey;
    dto.testManifestObjectKey = record.testManifestObjectKey;
    dto.createdAt = record.createdAt.toISOString();
    return dto;
  }
}
