import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/** REQ-2.4/2.5: rejects any request without a valid, unexpired JWT bearer token. */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {}
