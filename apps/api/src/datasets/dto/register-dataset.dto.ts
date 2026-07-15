import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

/** REQ-8.1/8.2: every field here is mandatory — `DatasetsService.register()` re-validates provenance/license non-emptiness regardless (defense in depth against a future caller that bypasses DTO validation), but `class-validator` rejects a missing field before the service is even reached. */
export class RegisterDatasetDto {
  @ApiProperty({ example: "coastal-vehicles" })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: "v1" })
  @IsString()
  @IsNotEmpty()
  version!: string;

  @ApiProperty({ example: "datasets/coastal-vehicles-v1/" })
  @IsString()
  @IsNotEmpty()
  storageLocation!: string;

  @ApiProperty({ example: "Synthetic renders, internal simulation pipeline" })
  @IsString()
  @IsNotEmpty()
  source!: string;

  @ApiProperty({ example: "Rendered from approved simulation scenarios" })
  @IsString()
  @IsNotEmpty()
  collectionMethod!: string;

  @ApiProperty({ example: "CC-BY-4.0" })
  @IsString()
  @IsNotEmpty()
  license!: string;

  @ApiProperty({
    example:
      "Generated 2026-07 for civilian/synthetic vehicle detection training, no real-world imagery.",
  })
  @IsString()
  @IsNotEmpty()
  provenanceNotes!: string;
}
