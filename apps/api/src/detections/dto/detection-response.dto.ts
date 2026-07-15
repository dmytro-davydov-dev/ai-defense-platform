import { ApiProperty } from "@nestjs/swagger";
import type { DetectionRecord } from "../detection.types";

export class DetectionBoundingBoxDto {
  @ApiProperty() x!: number;
  @ApiProperty() y!: number;
  @ApiProperty() width!: number;
  @ApiProperty() height!: number;
}

/** REQ-6.2: response shape for `GET /missions/:id/detections` — the video player/overlay (REQ-6.13) and stats (REQ-6.15) both read this. */
export class DetectionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() missionId!: string;
  @ApiProperty() frameIndex!: number;
  @ApiProperty() frameTimestampMs!: number;
  @ApiProperty() trackId!: number;
  @ApiProperty() label!: string;
  @ApiProperty() confidence!: number;
  @ApiProperty({ type: DetectionBoundingBoxDto })
  boundingBox!: DetectionBoundingBoxDto;
  @ApiProperty() createdAt!: string;

  static fromRecord(record: DetectionRecord): DetectionResponseDto {
    const dto = new DetectionResponseDto();
    dto.id = record.id;
    dto.missionId = record.missionId;
    dto.frameIndex = record.frameIndex;
    dto.frameTimestampMs = record.frameTimestampMs;
    dto.trackId = record.trackId;
    dto.label = record.label;
    dto.confidence = record.confidence;
    dto.boundingBox = record.boundingBox;
    dto.createdAt = record.createdAt.toISOString();
    return dto;
  }
}
