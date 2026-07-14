import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CORRELATION_ID_HEADER } from "@ai-defense/observability";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ROLE_NAMES } from "../roles/roles.constants";
import type { AuthenticatedUser } from "../auth/auth.types";
import { StorageService } from "../storage/storage.service";
import { SignedUrlResponseDto } from "../storage/dto/signed-url-response.dto";
import { CreateUploadUrlDto } from "../storage/dto/create-upload-url.dto";
import { MissionsService } from "./missions.service";
import { CreateMissionDto } from "./dto/create-mission.dto";
import { UpdateMissionMetadataDto } from "./dto/update-mission-metadata.dto";
import { TransitionMissionDto } from "./dto/transition-mission.dto";
import { MissionResponseDto } from "./dto/mission-response.dto";

/** REQ-2.7/2.8: mission CRUD + state transitions. Every mutating route requires an authenticated operator/admin (REQ-2.5). */
@ApiTags("missions")
@ApiBearerAuth()
@Controller("missions")
export class MissionsController {
  constructor(
    private readonly missionsService: MissionsService,
    private readonly storageService: StorageService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_NAMES.OPERATOR, ROLE_NAMES.ADMIN)
  @ApiOperation({ summary: "Create a mission in DRAFT state." })
  async create(
    @Body() dto: CreateMissionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<MissionResponseDto> {
    const mission = await this.missionsService.createMission(
      {
        title: dto.title,
        description: dto.description ?? null,
        createdById: user.userId,
      },
      { actorUserId: user.userId, correlationId: readCorrelationId(req) },
    );
    return MissionResponseDto.fromRecord(mission);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "List all missions." })
  async list(): Promise<MissionResponseDto[]> {
    const missions = await this.missionsService.listMissions();
    return missions.map((mission) => MissionResponseDto.fromRecord(mission));
  }

  @Get(":id")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Get a mission by id." })
  async get(@Param("id") id: string): Promise<MissionResponseDto> {
    const mission = await this.missionsService.getMission(id);
    return MissionResponseDto.fromRecord(mission);
  }

  @Patch(":id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_NAMES.OPERATOR, ROLE_NAMES.ADMIN)
  @ApiOperation({ summary: "Update mission metadata (only while DRAFT)." })
  async updateMetadata(
    @Param("id") id: string,
    @Body() dto: UpdateMissionMetadataDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<MissionResponseDto> {
    const mission = await this.missionsService.updateMetadata(id, dto, {
      actorUserId: user.userId,
      correlationId: readCorrelationId(req),
    });
    return MissionResponseDto.fromRecord(mission);
  }

  @Post(":id/transition")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_NAMES.OPERATOR, ROLE_NAMES.ADMIN)
  @ApiOperation({
    summary: "Transition a mission's state (REQ-2.2 state machine enforced).",
  })
  async transition(
    @Param("id") id: string,
    @Body() dto: TransitionMissionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<MissionResponseDto> {
    const mission = await this.missionsService.transition(id, dto.targetState, {
      actorUserId: user.userId,
      correlationId: readCorrelationId(req),
    });
    return MissionResponseDto.fromRecord(mission);
  }

  @Post(":id/upload-url")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_NAMES.OPERATOR, ROLE_NAMES.ADMIN)
  @ApiOperation({
    summary:
      "Issue a presigned MinIO upload URL scoped to this mission and attach the object key (REQ-2.9, mission-scoped).",
  })
  async createUploadUrl(
    @Param("id") id: string,
    @Body() dto: CreateUploadUrlDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<SignedUrlResponseDto> {
    // Mission must exist (and be editable) before we hand out an upload
    // slot for it — reuses the same DRAFT-only rule as metadata edits.
    await this.missionsService.getMission(id);
    const objectKey = this.storageService.buildObjectKey(
      `missions/${id}`,
      dto.fileName,
    );
    const result = await this.storageService.generateUploadUrl(
      objectKey,
      dto.contentType,
    );

    await this.missionsService.attachVideo(id, result.objectKey, {
      actorUserId: user.userId,
      correlationId: readCorrelationId(req),
    });

    return {
      url: result.url,
      objectKey: result.objectKey,
      expiresAt: result.expiresAt.toISOString(),
    };
  }
}

function readCorrelationId(req: Request): string | undefined {
  const header = req.headers[CORRELATION_ID_HEADER];
  return Array.isArray(header) ? header[0] : header;
}
