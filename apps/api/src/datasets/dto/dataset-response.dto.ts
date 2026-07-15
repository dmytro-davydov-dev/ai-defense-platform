import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type { DatasetRecord } from "../dataset.types";

export class DatasetResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() version!: string;
  @ApiProperty() storageLocation!: string;
  @ApiProperty() source!: string;
  @ApiProperty() collectionMethod!: string;
  @ApiProperty() license!: string;
  @ApiProperty() provenanceNotes!: string;
  @ApiPropertyOptional({ nullable: true }) createdById!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;

  static fromRecord(record: DatasetRecord): DatasetResponseDto {
    const dto = new DatasetResponseDto();
    dto.id = record.id;
    dto.name = record.name;
    dto.version = record.version;
    dto.storageLocation = record.storageLocation;
    dto.source = record.source;
    dto.collectionMethod = record.collectionMethod;
    dto.license = record.license;
    dto.provenanceNotes = record.provenanceNotes;
    dto.createdById = record.createdById ?? null;
    dto.createdAt = record.createdAt.toISOString();
    dto.updatedAt = record.updatedAt.toISOString();
    return dto;
  }
}
