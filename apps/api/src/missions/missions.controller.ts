import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request } from "express";
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
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
import { AuditService } from "../audit/audit.service";
import { AuditLogResponseDto } from "../audit/dto/audit-log-response.dto";
import { DetectionsService } from "../detections/detections.service";
import { DetectionResponseDto } from "../detections/dto/detection-response.dto";
import { TelemetryService } from "../telemetry/telemetry.service";
import { TelemetryParseError } from "../telemetry/telemetry.types";
import { TelemetryResponseDto } from "../telemetry/dto/telemetry-response.dto";
import { TelemetryIngestResponseDto } from "../telemetry/dto/telemetry-ingest-response.dto";
import { MissionsService } from "./missions.service";
import { CreateMissionDto } from "./dto/create-mission.dto";
import { UpdateMissionMetadataDto } from "./dto/update-mission-metadata.dto";
import { TransitionMissionDto } from "./dto/transition-mission.dto";
import { MissionResponseDto } from "./dto/mission-response.dto";

/**
 * REQ-7.2: a narrow structural type for the file `FileInterceptor`
 * hands the route handler, rather than `Express.Multer.File` — this
 * repo has never added `@types/multer` as a dependency (multer 2.x
 * ships no types of its own), and adding an unverified new type
 * dependency in a sandbox that can't run `pnpm install` to confirm it
 * resolves (see docs/roadmap/Progress.md's recurring Known gaps) is
 * riskier than declaring exactly the two fields this handler actually
 * reads. `FileInterceptor("file")` with no storage option configured
 * uses multer's default `MemoryStorage`, which always populates
 * `buffer` — never `path`.
 */
interface UploadedMulterFile {
  readonly buffer: Buffer;
  readonly originalname: string;
}

/** REQ-2.7/2.8: mission CRUD + state transitions. Every mutating route requires an authenticated operator/admin (REQ-2.5). */
@ApiTags("missions")
@ApiBearerAuth()
@Controller("missions")
export class MissionsController {
  constructor(
    private readonly missionsService: MissionsService,
    private readonly storageService: StorageService,
    private readonly auditService: AuditService,
    private readonly detectionsService: DetectionsService,
    private readonly telemetryService: TelemetryService,
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

  @Get(":id/detections")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      "List a mission's persisted detections (REQ-6.1/6.2), ordered by frame index — backs the video overlay (REQ-6.13) and stats (REQ-6.15).",
  })
  async listDetections(
    @Param("id") id: string,
  ): Promise<DetectionResponseDto[]> {
    await this.missionsService.getMission(id);
    const detections = await this.detectionsService.listForMission(id);
    return detections.map((detection) =>
      DetectionResponseDto.fromRecord(detection),
    );
  }

  @Get(":id/audit-log")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      "List a mission's audit trail (REQ-6.3), chronologically — backs the audit-trail view (REQ-6.16).",
  })
  async listAuditLog(@Param("id") id: string): Promise<AuditLogResponseDto[]> {
    await this.missionsService.getMission(id);
    const entries = await this.auditService.listForMission(id);
    return entries.map((entry) => AuditLogResponseDto.fromRecord(entry));
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

  @Post(":id/telemetry")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_NAMES.OPERATOR, ROLE_NAMES.ADMIN)
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  @ApiConsumes("multipart/form-data")
  @ApiOperation({
    summary:
      "Batch-ingest a mission's telemetry from a CSV or GeoJSON file (REQ-7.2). No live sensor feed — a single file upload replaces nothing, it only appends.",
  })
  async uploadTelemetry(
    @Param("id") id: string,
    @UploadedFile() file: UploadedMulterFile | undefined,
  ): Promise<TelemetryIngestResponseDto> {
    await this.missionsService.getMission(id);
    if (!file) {
      throw new BadRequestException(
        "a telemetry file is required (field name: file)",
      );
    }
    try {
      const { pointCount } = await this.telemetryService.ingest(
        id,
        file.buffer.toString("utf-8"),
      );
      return { missionId: id, pointCount };
    } catch (error) {
      if (error instanceof TelemetryParseError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Get(":id/telemetry")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      "Read a mission's persisted telemetry as a GeoJSON LineString (REQ-7.3) — backs the map container (REQ-7.5/7.6). Every response is flagged properties.approximate=true (REQ-7.7): never verified targeting data.",
  })
  async getTelemetry(@Param("id") id: string): Promise<TelemetryResponseDto> {
    await this.missionsService.getMission(id);
    const records = await this.telemetryService.listForMission(id);
    return TelemetryResponseDto.fromRecords(id, records);
  }
}

function readCorrelationId(req: Request): string | undefined {
  const header = req.headers[CORRELATION_ID_HEADER];
  return Array.isArray(header) ? header[0] : header;
}
