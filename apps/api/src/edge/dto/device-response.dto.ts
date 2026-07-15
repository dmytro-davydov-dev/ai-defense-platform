import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type { EdgeDeviceRecord } from "../edge-device.types";

/** Never carries the bearer token or its hash — see `DeviceRegisteredResponseDto` for the one-time registration response that does carry the token. */
export class DeviceResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() deviceId!: string;
  @ApiPropertyOptional({ nullable: true }) displayName!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiPropertyOptional({ nullable: true }) lastSeenAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) lastSyncAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) revokedAt!: string | null;

  static fromRecord(record: EdgeDeviceRecord): DeviceResponseDto {
    const dto = new DeviceResponseDto();
    dto.id = record.id;
    dto.deviceId = record.deviceId;
    dto.displayName = record.displayName;
    dto.createdAt = record.createdAt.toISOString();
    dto.lastSeenAt = record.lastSeenAt ? record.lastSeenAt.toISOString() : null;
    dto.lastSyncAt = record.lastSyncAt ? record.lastSyncAt.toISOString() : null;
    dto.revokedAt = record.revokedAt ? record.revokedAt.toISOString() : null;
    return dto;
  }
}

/**
 * REQ-9.9: returned only from `POST /devices` — the one and only time
 * the plaintext bearer token is ever available. It cannot be retrieved
 * again; losing it means re-registering (or revoking and registering a
 * replacement device entry). Deliberately not a subclass of
 * `DeviceResponseDto` — a shared base would make it easy to
 * accidentally return `token` from a route that only ever meant to
 * expose `DeviceResponseDto`'s fields.
 */
export class DeviceRegisteredResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() deviceId!: string;
  @ApiPropertyOptional({ nullable: true }) displayName!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty({
    description:
      "The device's bearer credential, in plaintext, exactly once. Store it securely on the device — it cannot be retrieved again.",
  })
  token!: string;

  static fromRegistration(
    record: EdgeDeviceRecord,
    token: string,
  ): DeviceRegisteredResponseDto {
    const dto = new DeviceRegisteredResponseDto();
    dto.id = record.id;
    dto.deviceId = record.deviceId;
    dto.displayName = record.displayName;
    dto.createdAt = record.createdAt.toISOString();
    dto.token = token;
    return dto;
  }
}
