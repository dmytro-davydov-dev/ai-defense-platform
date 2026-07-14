import { Body, Controller, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CORRELATION_ID_HEADER } from "@ai-defense/observability";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { AuthResponseDto } from "./dto/auth-response.dto";

/** REQ-2.4: registration + login. Every mutating route below is public by nature — there's no user yet to authenticate as. */
@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @ApiOperation({ summary: "Create a new operator account and return a JWT." })
  register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
  ): Promise<AuthResponseDto> {
    return this.authService.register(dto, {
      correlationId: readCorrelationId(req),
    });
  }

  @Post("login")
  @ApiOperation({ summary: "Exchange email/password for a JWT." })
  login(@Body() dto: LoginDto, @Req() req: Request): Promise<AuthResponseDto> {
    return this.authService.login(dto, {
      correlationId: readCorrelationId(req),
    });
  }
}

function readCorrelationId(req: Request): string | undefined {
  const header = req.headers[CORRELATION_ID_HEADER];
  return Array.isArray(header) ? header[0] : header;
}
