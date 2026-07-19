import { ApiProperty } from "@nestjs/swagger";
import { MissionStatus } from "../../../generated/prisma/client";
import type { MissionRecord } from "../mission.types";

export class MissionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ enum: MissionStatus }) status!: MissionStatus;
  @ApiProperty({ nullable: true, type: String }) videoObjectKey!: string | null;
  @ApiProperty() createdById!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
  @ApiProperty({ nullable: true, type: String }) archivedAt!: string | null;

  static fromRecord(mission: MissionRecord): MissionResponseDto {
    const dto = new MissionResponseDto();
    dto.id = mission.id;
    dto.title = mission.title;
    dto.description = mission.description;
    dto.status = mission.status;
    dto.videoObjectKey = mission.videoObjectKey;
    dto.createdById = mission.createdById;
    dto.createdAt = mission.createdAt.toISOString();
    dto.updatedAt = mission.updatedAt.toISOString();
    dto.archivedAt = mission.archivedAt
      ? mission.archivedAt.toISOString()
      : null;
    return dto;
  }
}
