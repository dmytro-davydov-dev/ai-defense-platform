import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

/**
 * REQ-8.3: a dataset's full item manifest, submitted as a plain JSON
 * array rather than a file upload (unlike REQ-7.2's telemetry CSV
 * upload) — a manifest is just a list of item identifiers, small enough
 * for a reference implementation's scope that a multipart file adds
 * ceremony (an extra content-type branch, a `FileInterceptor`) without
 * a corresponding benefit here.
 */
export class GenerateSplitDto {
  @ApiProperty({
    type: [String],
    example: ["frame-0001.jpg", "frame-0002.jpg"],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  items!: string[];

  @ApiProperty({ example: 0.7 })
  @IsNumber()
  @Min(0)
  @Max(1)
  trainRatio!: number;

  @ApiProperty({ example: 0.2 })
  @IsNumber()
  @Min(0)
  @Max(1)
  validationRatio!: number;

  @ApiProperty({ example: 0.1 })
  @IsNumber()
  @Min(0)
  @Max(1)
  testRatio!: number;

  @ApiPropertyOptional({
    example: 20260715,
    description:
      "Seed for the deterministic shuffle. Omit to use the platform's fixed default seed.",
  })
  @IsOptional()
  @IsInt()
  seed?: number;
}
