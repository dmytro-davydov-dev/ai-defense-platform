import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ROLE_NAMES } from "../roles/roles.constants";
import type { AuthenticatedUser } from "../auth/auth.types";
import { DatasetsService } from "./datasets.service";
import { RegisterDatasetDto } from "./dto/register-dataset.dto";
import { DatasetResponseDto } from "./dto/dataset-response.dto";
import { GenerateSplitDto } from "./dto/generate-split.dto";
import { DatasetSplitResponseDto } from "./dto/dataset-split-response.dto";

/**
 * PRD-Phase-8 (docs/mvp-plan/PRD-Phase-8.md) REQ-8.1-8.3: dataset
 * registry and split generation — a platform-level catalog, not
 * mission-scoped, so this is its own top-level controller rather than
 * a route nested under `MissionsController` (the same standalone shape
 * `StorageController` already uses).
 */
@ApiTags("datasets")
@ApiBearerAuth()
@Controller("datasets")
export class DatasetsController {
  constructor(private readonly datasetsService: DatasetsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_NAMES.OPERATOR, ROLE_NAMES.ADMIN)
  @ApiOperation({
    summary:
      "Register a dataset (REQ-8.1). Provenance and license metadata are mandatory (REQ-8.2) — registration is rejected without them.",
  })
  async register(
    @Body() dto: RegisterDatasetDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DatasetResponseDto> {
    const dataset = await this.datasetsService.register({
      name: dto.name,
      version: dto.version,
      storageLocation: dto.storageLocation,
      source: dto.source,
      collectionMethod: dto.collectionMethod,
      license: dto.license,
      provenanceNotes: dto.provenanceNotes,
      createdById: user.userId,
    });
    return DatasetResponseDto.fromRecord(dataset);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "List all registered datasets." })
  async list(): Promise<DatasetResponseDto[]> {
    const datasets = await this.datasetsService.listAll();
    return datasets.map((dataset) => DatasetResponseDto.fromRecord(dataset));
  }

  @Get(":id")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Get a registered dataset by id." })
  async get(@Param("id") id: string): Promise<DatasetResponseDto> {
    const dataset = await this.datasetsService.getById(id);
    return DatasetResponseDto.fromRecord(dataset);
  }

  @Post(":id/splits")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_NAMES.OPERATOR, ROLE_NAMES.ADMIN)
  @ApiOperation({
    summary:
      "Generate a deterministic, seeded train/validation/test split (REQ-8.3) over a supplied item manifest.",
  })
  async generateSplit(
    @Param("id") id: string,
    @Body() dto: GenerateSplitDto,
  ): Promise<DatasetSplitResponseDto> {
    const split = await this.datasetsService.generateSplit(id, dto);
    return DatasetSplitResponseDto.fromRecord(split);
  }

  @Get("splits/:splitId")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Get a previously generated split by id." })
  async getSplit(
    @Param("splitId") splitId: string,
  ): Promise<DatasetSplitResponseDto> {
    const split = await this.datasetsService.getSplitById(splitId);
    return DatasetSplitResponseDto.fromRecord(split);
  }
}
