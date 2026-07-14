import { ApiProperty } from "@nestjs/swagger";

export class AuthUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ type: [String] }) roles!: string[];
}

export class AuthResponseDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty({ description: "Seconds until the access token expires." })
  expiresInSeconds!: number;
  @ApiProperty({ type: AuthUserDto }) user!: AuthUserDto;
}
