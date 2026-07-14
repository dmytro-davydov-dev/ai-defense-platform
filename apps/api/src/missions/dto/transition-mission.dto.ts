import { ApiProperty } from "@nestjs/swagger";
import { IsEnum } from "class-validator";
import { MissionStatus } from "../../../generated/prisma/client";

export class TransitionMissionDto {
  @ApiProperty({ enum: MissionStatus, example: MissionStatus.QUEUED })
  @IsEnum(MissionStatus)
  targetState!: MissionStatus;
}
