import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString, Matches } from "class-validator";

export class RegisterDeviceDto {
  @ApiProperty({
    example: "jetson-01",
    description:
      "Human-chosen label this device authenticates and synchronizes as. Must be unique across all registered devices.",
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: "deviceId may only contain letters, digits, '.', '_', '-'",
  })
  deviceId!: string;

  @ApiPropertyOptional({ example: "Jetson Orin Nano — perimeter camera 1" })
  @IsOptional()
  @IsString()
  displayName?: string;
}
