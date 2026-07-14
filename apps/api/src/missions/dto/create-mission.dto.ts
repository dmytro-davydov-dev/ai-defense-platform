import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateMissionDto {
  @ApiProperty({ example: "Coastal flyover — sector 4" })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional({
    example: "Weekly inspection pass, sector 4 shoreline.",
  })
  @IsOptional()
  @IsString()
  description?: string;
}
