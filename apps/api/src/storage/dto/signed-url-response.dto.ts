import { ApiProperty } from "@nestjs/swagger";

export class SignedUrlResponseDto {
  @ApiProperty({ description: "Time-limited presigned URL against MinIO." })
  url!: string;

  @ApiProperty({ description: "Object key the URL grants access to." })
  objectKey!: string;

  @ApiProperty({ description: "ISO-8601 timestamp the URL stops working." })
  expiresAt!: string;
}
