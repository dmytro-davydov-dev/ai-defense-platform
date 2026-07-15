import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { ROLE_NAMES } from "../roles/roles.constants";
import { TrainingRunsService } from "./training-runs.service";
import { RecordTrainingRunDto } from "./dto/record-training-run.dto";
import { TrainingRunResponseDto } from "./dto/training-run-response.dto";

/**
 * PRD-Phase-8 (docs/mvp-plan/PRD-Phase-8.md) REQ-8.7/8.8/8.13/8.14: the
 * experiment-tracking surface `apps/vision-service`'s training script
 * calls into (`POST`), and an operator/reviewer reads from (`GET`).
 */
@ApiTags("training-runs")
@ApiBearerAuth()
@Controller("training-runs")
export class TrainingRunsController {
  constructor(private readonly trainingRunsService: TrainingRunsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_NAMES.OPERATOR, ROLE_NAMES.ADMIN)
  @ApiOperation({
    summary:
      "Record a completed or failed training run (REQ-8.7). COMPLETED runs require an evaluationReport (REQ-8.8/8.13/8.14).",
  })
  async record(
    @Body() dto: RecordTrainingRunDto,
  ): Promise<TrainingRunResponseDto> {
    const run = await this.trainingRunsService.record({
      datasetId: dto.datasetId,
      datasetSplitId: dto.datasetSplitId,
      gitCommit: dto.gitCommit ?? null,
      hyperparameters: dto.hyperparameters,
      status: dto.status,
      metrics: dto.metrics,
      evaluationReport: dto.evaluationReport ?? null,
      startedAt: new Date(dto.startedAt),
      completedAt: dto.completedAt ? new Date(dto.completedAt) : null,
    });
    return TrainingRunResponseDto.fromRecord(run);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: "List training runs, optionally filtered by dataset.",
  })
  async list(
    @Query("datasetId") datasetId?: string,
  ): Promise<TrainingRunResponseDto[]> {
    const runs = await this.trainingRunsService.listAll(datasetId);
    return runs.map((run) => TrainingRunResponseDto.fromRecord(run));
  }

  @Get(":id")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: "Get a training run, including its full evaluation report.",
  })
  async get(@Param("id") id: string): Promise<TrainingRunResponseDto> {
    const run = await this.trainingRunsService.getById(id);
    return TrainingRunResponseDto.fromRecord(run);
  }
}
