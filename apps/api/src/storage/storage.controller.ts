import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { StorageService } from "./storage.service";
import { CreateUploadUrlDto } from "./dto/create-upload-url.dto";
import { SignedUrlResponseDto } from "./dto/signed-url-response.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { ROLE_NAMES } from "../roles/roles.constants";
import { JwtOrDeviceAuthGuard } from "../edge-auth/jwt-or-device-auth.guard";

/**
 * REQ-2.9: signed upload/download URLs against MinIO.
 *
 * Now RBAC-guarded (REQ-2.5) — closes the temporary gap tracked in
 * Security_Baseline.md/API_Shell.md once AuthModule/PrismaService
 * landed.
 *
 * Still top-level (`/storage/...`) rather than mission-scoped: for a
 * mission's own upload flow, prefer
 * `POST /missions/:id/upload-url` (`MissionsController`), which
 * additionally records the object key on the mission and writes an
 * audit row. These generic routes remain for any non-mission-scoped
 * use of `StorageService`.
 */
@ApiTags("storage")
@ApiBearerAuth()
@Controller("storage")
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post("upload-url")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_NAMES.OPERATOR, ROLE_NAMES.ADMIN)
  @ApiOperation({
    summary: "Issue a presigned MinIO upload URL for a new object.",
  })
  async createUploadUrl(
    @Body() dto: CreateUploadUrlDto,
  ): Promise<SignedUrlResponseDto> {
    const objectKey = this.storageService.buildObjectKey(
      "uploads",
      dto.fileName,
    );
    const result = await this.storageService.generateUploadUrl(
      objectKey,
      dto.contentType,
    );
    return {
      url: result.url,
      objectKey: result.objectKey,
      expiresAt: result.expiresAt.toISOString(),
    };
  }

  @Get("download-url")
  @UseGuards(JwtOrDeviceAuthGuard)
  @ApiOperation({
    summary:
      "Issue a presigned MinIO download URL for an existing object. Accepts either an operator/admin JWT or an edge device's bearer token (REQ-9.13/9.15, docs/adr/ADR-011-device-identity-and-sync-transport.md) — the edge agent uses this to download its resolved production model without ever holding MinIO credentials directly.",
  })
  async getDownloadUrl(
    @Query("objectKey") objectKey?: string,
  ): Promise<SignedUrlResponseDto> {
    if (!objectKey) {
      throw new BadRequestException("objectKey query parameter is required");
    }
    const result = await this.storageService.generateDownloadUrl(objectKey);
    return {
      url: result.url,
      objectKey: result.objectKey,
      expiresAt: result.expiresAt.toISOString(),
    };
  }
}
