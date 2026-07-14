import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty, IsString, MinLength } from "class-validator";

export class RegisterDto {
  @ApiProperty({ example: "operator@ai-defense.example" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "correct horse battery staple", minLength: 8 })
  @IsString()
  @MinLength(8, { message: "password must be at least 8 characters" })
  password!: string;

  @ApiProperty({ example: "Jane Operator" })
  @IsString()
  @IsNotEmpty()
  displayName!: string;
}
