import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CORRELATION_ID_HEADER } from "@ai-defense/observability";
import { DeviceAuthGuard } from "../edge-auth/device-auth.guard";
import { CurrentDevice } from "../edge-auth/current-device.decorator";
import type { AuthenticatedDevice } from "../edge-auth/device-auth.types";
import { EdgeEventsService } from "./edge-events.service";
import { IngestEdgeEventsDto } from "./dto/ingest-events.dto";
import { UnsupportedEdgeEventTypeError } from "./edge-event.types";

/**
 * PRD-Phase-9 (docs/mvp-plan/PRD-Phase-9.md) REQ-9.6/9.9,
 * docs/adr/ADR-011-device-identity-and-sync-transport.md:
 * device-authenticated only — no `JwtAuthGuard` fallback here, unlike
 * `GET /models/production`/`GET /storage/download-url`. This route
 * exists exclusively for edge devices to synchronize buffered events;
 * an operator has no reason to call it.
 */
@ApiTags("edge-events")
@ApiBearerAuth()
@Controller("edge/events")
export class EdgeEventsController {
  constructor(private readonly edgeEventsService: EdgeEventsService) {}

  @Post()
  @UseGuards(DeviceAuthGuard)
  @ApiOperation({
    summary:
      "Synchronize a batch of buffered edge events (REQ-9.6). Idempotent per eventId (REQ-9.7) — safe to retry an entire batch after a network interruption.",
  })
  async ingest(
    @Body() dto: IngestEdgeEventsDto,
    @CurrentDevice() device: AuthenticatedDevice | undefined,
    @Req() req: Request,
  ): Promise<{ accepted: number; duplicates: number }> {
    if (!device) {
      // DeviceAuthGuard should have rejected this already; treat as a
      // defensive check, not the primary enforcement point.
      throw new BadRequestException("EDGE_DEVICE_CONTEXT_MISSING");
    }
    try {
      return await this.edgeEventsService.ingest(
        device,
        dto.events,
        readCorrelationId(req),
      );
    } catch (error) {
      if (error instanceof UnsupportedEdgeEventTypeError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}

function readCorrelationId(req: Request): string | undefined {
  const header = req.headers[CORRELATION_ID_HEADER];
  return Array.isArray(header) ? header[0] : header;
}
