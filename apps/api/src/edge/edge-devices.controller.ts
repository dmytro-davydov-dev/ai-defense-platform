import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ROLE_NAMES } from "../roles/roles.constants";
import type { AuthenticatedUser } from "../auth/auth.types";
import { EdgeDevicesService } from "./edge-devices.service";
import { RegisterDeviceDto } from "./dto/register-device.dto";
import {
  DeviceRegisteredResponseDto,
  DeviceResponseDto,
} from "./dto/device-response.dto";

/**
 * PRD-Phase-9 (docs/mvp-plan/PRD-Phase-9.md) REQ-9.9,
 * docs/adr/ADR-011-device-identity-and-sync-transport.md: device
 * registration/lifecycle — admin-only, the same way
 * `ModelRegistryController`'s promote/rollback are admin-only, since
 * issuing or revoking a device's ability to synchronize into the
 * platform is a higher-consequence action than ordinary mission CRUD.
 */
@ApiTags("edge-devices")
@ApiBearerAuth()
@Controller("devices")
export class EdgeDevicesController {
  constructor(private readonly edgeDevicesService: EdgeDevicesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_NAMES.ADMIN)
  @ApiOperation({
    summary:
      "Register a new edge device (REQ-9.9). Returns a bearer token exactly once — it cannot be retrieved again.",
  })
  async register(
    @Body() dto: RegisterDeviceDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DeviceRegisteredResponseDto> {
    const { device, token } = await this.edgeDevicesService.register({
      deviceId: dto.deviceId,
      displayName: dto.displayName ?? null,
      createdById: user.userId,
    });
    return DeviceRegisteredResponseDto.fromRegistration(device, token);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_NAMES.ADMIN)
  @ApiOperation({ summary: "List all registered edge devices." })
  async list(): Promise<DeviceResponseDto[]> {
    const devices = await this.edgeDevicesService.listAll();
    return devices.map((device) => DeviceResponseDto.fromRecord(device));
  }

  @Get(":id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_NAMES.ADMIN)
  @ApiOperation({ summary: "Get an edge device by id." })
  async get(@Param("id") id: string): Promise<DeviceResponseDto> {
    const device = await this.edgeDevicesService.getById(id);
    return DeviceResponseDto.fromRecord(device);
  }

  @Post(":id/revoke")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE_NAMES.ADMIN)
  @ApiOperation({
    summary:
      "Revoke a device's access (REQ-9.9) — the only supported way to invalidate its bearer token; there is no rotation in this phase.",
  })
  async revoke(@Param("id") id: string): Promise<DeviceResponseDto> {
    const device = await this.edgeDevicesService.revoke(id);
    return DeviceResponseDto.fromRecord(device);
  }
}
