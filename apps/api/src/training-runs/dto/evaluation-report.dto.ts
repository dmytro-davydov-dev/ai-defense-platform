import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsNumber,
  IsString,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export class EvaluationClassMetricDto {
  @ApiProperty({ example: "car" })
  @IsString()
  label!: string;

  @ApiProperty({ example: 0.82 })
  @IsNumber()
  @Min(0)
  @Max(1)
  precision!: number;

  @ApiProperty({ example: 0.74 })
  @IsNumber()
  @Min(0)
  @Max(1)
  recall!: number;

  @ApiProperty({ example: 0.79 })
  @IsNumber()
  @Min(0)
  @Max(1)
  averagePrecision!: number;

  @ApiProperty({ example: 143 })
  @IsNumber()
  @Min(0)
  supportCount!: number;
}

/**
 * REQ-8.8/8.13/8.14: per-class metrics plus the two report sections
 * that operationalize the risk register's "Show confidence, provenance
 * and review requirements" mitigation — `flaggedClasses` (materially
 * low-performing classes, REQ-8.13) and `failureNotes` (human-written,
 * REQ-8.14) are both required arrays (may be empty) so a caller can't
 * omit them by accident.
 */
export class EvaluationReportDto {
  @ApiProperty({ example: 0.71 })
  @IsNumber()
  @Min(0)
  @Max(1)
  meanAveragePrecision!: number;

  @ApiProperty({ type: [EvaluationClassMetricDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EvaluationClassMetricDto)
  perClass!: EvaluationClassMetricDto[];

  @ApiProperty({
    type: [String],
    example: ["boat"],
    description: "REQ-8.13: classes materially below the dataset average.",
  })
  @IsArray()
  @IsString({ each: true })
  flaggedClasses!: string[];

  @ApiProperty({
    type: [String],
    example: ["Systematic false negatives on boats under 20% frame coverage."],
    description: "REQ-8.14: human-written, not automatically inferred.",
  })
  @IsArray()
  @IsString({ each: true })
  failureNotes!: string[];
}
