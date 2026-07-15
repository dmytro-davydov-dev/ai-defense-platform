import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ROLE_NAMES } from "../roles/roles.constants";
import { JwtOrDeviceAuthGuard } from "../edge-auth/jwt-or-device-auth.guard";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ModelRegistryService } from "./model-registry.service";
import { RegisterModelDto } from "./dto/register-model.dto";
import { ModelVersionResponseDto } from "./dto/model-version-response.dto";
import { RollbackModelDto } from "./dto/rollback-model.dto";

/**
 * PRD-Phase-8 (docs/mvp-plan/PRD-Phase-8.md) REQ-8.9-8.12: model
 * registry, promotion, and rollback — a platform-level catalog, its own
 * top-level controller like `DatasetsController`/`StorageController`.
 *
 * Route order matters here for the same structural reason as
 * `DatasetsController`: `GET /models/production` is declared before
 * `GET /models/:id` so it isn't swallowed by the `:id` wildcard (both
 * are one path segment after `/models`, and NestJS/Express match
 * registration order when two routes are otherwise ambiguous).
 */
@ApiTags("models")
@ApiBearerAuth()
@Controller("models")
export class ModelRegistryController {
  constructor(private readonly modelRegistryService: ModelRegistryService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_NAMES.OPERATOR, ROLE_NAMES.ADMIN)
  @ApiOperation({
    summary:
      "Register an exported .onnx model artifact against a COMPLETED training run (REQ-8.9). Starts in CANDIDATE stage.",
  })
  async register(
    @Body() dto: RegisterModelDto,
  ): Promise<ModelVersionResponseDto> {
    const model = await this.modelRegistryService.register(dto);
    return ModelVersionResponseDto.fromRecord(model);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "List all registered model versions." })
  async list(): Promise<ModelVersionResponseDto[]> {
    const models = await this.modelRegistryService.listAll();
    return models.map((model) => ModelVersionResponseDto.fromRecord(model));
  }

  @Get("production")
  @UseGuards(JwtOrDeviceAuthGuard)
  @ApiOperation({
    summary:
      "Get the current production model version (REQ-8.10) — the one apps/vision-service's detector factory resolves at startup when no explicit model path is configured. Also used by the edge agent (REQ-9.13, docs/adr/ADR-011-device-identity-and-sync-transport.md) with a device token in place of an operator JWT.",
  })
  async getProduction(): Promise<ModelVersionResponseDto> {
    const model = await this.modelRegistryService.getProduction();
    if (!model) {
      throw new NotFoundException(
        "no model version is currently in production",
      );
    }
    return ModelVersionResponseDto.fromRecord(model);
  }

  @Get(":id")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Get a model version by id." })
  async get(@Param("id") id: string): Promise<ModelVersionResponseDto> {
    const model = await this.modelRegistryService.getById(id);
    return ModelVersionResponseDto.fromRecord(model);
  }

  @Post(":id/promote")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_NAMES.ADMIN)
  @ApiOperation({
    summary:
      "Promote a model version to production (REQ-8.10), demoting the current production model (if any) to STAGED. Audited (REQ-8.12).",
  })
  async promote(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ModelVersionResponseDto> {
    const model = await this.modelRegistryService.promote(id, user.userId);
    return ModelVersionResponseDto.fromRecord(model);
  }

  @Post("rollback")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_NAMES.ADMIN)
  @ApiOperation({
    summary:
      "Roll back production to a prior version (REQ-8.11) — the given toVersionId, or (if omitted) whatever was production immediately before the current one. Audited (REQ-8.12).",
  })
  async rollback(
    @Body() dto: RollbackModelDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ModelVersionResponseDto> {
    const model = await this.modelRegistryService.rollback(
      user.userId,
      dto.toVersionId,
    );
    return ModelVersionResponseDto.fromRecord(model);
  }
}
