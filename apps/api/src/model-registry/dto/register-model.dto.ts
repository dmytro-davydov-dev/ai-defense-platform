import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

/** REQ-8.9: `objectKey` is expected to already exist in the models bucket — uploaded there directly by `apps/vision-service`'s training script via its own `MinioClient`, not through this endpoint. */
export class RegisterModelDto {
  @ApiProperty() @IsString() @IsNotEmpty() trainingRunId!: string;

  @ApiProperty({ example: "abcd1234-ef56-.../model.onnx" })
  @IsString()
  @IsNotEmpty()
  objectKey!: string;
}
