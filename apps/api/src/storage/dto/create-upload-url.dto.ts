import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, Matches } from "class-validator";

export class CreateUploadUrlDto {
  @ApiProperty({ example: "mission-42-flyover.mp4" })
  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @ApiProperty({ example: "video/mp4" })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[-\w.]+\/[-\w.+]+$/, {
    message: "contentType must be a valid MIME type, e.g. video/mp4",
  })
  contentType!: string;
}
