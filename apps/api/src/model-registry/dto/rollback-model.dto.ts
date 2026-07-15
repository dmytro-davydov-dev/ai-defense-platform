import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

/** REQ-8.11: omit `toVersionId` to roll back to whatever was production immediately before the current one; provide it to roll back (or promote) to a specific prior version explicitly. */
export class RollbackModelDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  toVersionId?: string;
}
