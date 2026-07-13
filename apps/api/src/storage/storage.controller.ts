import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Query,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { StorageService } from "./storage.service";
import { CreateUploadUrlDto } from "./dto/create-upload-url.dto";
import { SignedUrlResponseDto } from "./dto/signed-url-response.dto";

/**
 * REQ-2.9: signed upload/download URLs against MinIO.
 *
 * TEMPORARY SECURITY GAP: these routes are unauthenticated. RBAC
 * (`@UseGuards(JwtAuthGuard, RolesGuard)`) is required per REQ-2.5
 * before this is production-safe, but AuthModule/PrismaService are
 * blocked in this environment until `prisma generate` can run against
 * a network with access to binaries.prisma.sh — see
 * docs/roadmap/Progress.md "Known gaps". Do not deploy this endpoint
 * as-is; the guard must land before Phase 2 closes (tracked as part of
 * REQ-2.5).
 *
 * Also temporary: routes live at the top level (`/storage/...`) rather
 * than nested under a mission (e.g. `POST /missions/:id/upload-url` per
 * PRD-Phase-2 §6 step 7) because `MissionModule` doesn't exist yet
 * (also blocked on Prisma). Once it does, this controller's logic
 * should move behind a mission-scoped route; `StorageService` itself
 * is already mission-agnostic and reusable as-is.
 */
@ApiTags("storage")
@Controller("storage")
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post("upload-url")
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
  @ApiOperation({
    summary: "Issue a presigned MinIO download URL for an existing object.",
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
