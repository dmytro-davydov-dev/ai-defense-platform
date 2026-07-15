import { ApiProperty } from "@nestjs/swagger";
import type { AuditLogRecord } from "../audit.types";

/** REQ-6.3: response shape for `GET /missions/:id/audit-log`. */
export class AuditLogResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true, type: String }) actorUserId!: string | null;
  @ApiProperty() action!: string;
  @ApiProperty() targetType!: string;
  @ApiProperty({ nullable: true, type: String }) targetId!: string | null;
  @ApiProperty({ nullable: true, type: String }) missionId!: string | null;
  @ApiProperty({ nullable: true, type: String }) correlationId!: string | null;
  @ApiProperty({ nullable: true, type: Object }) metadata!: unknown;
  @ApiProperty() createdAt!: string;

  static fromRecord(record: AuditLogRecord): AuditLogResponseDto {
    const dto = new AuditLogResponseDto();
    dto.id = record.id;
    dto.actorUserId = record.actorUserId;
    dto.action = record.action;
    dto.targetType = record.targetType;
    dto.targetId = record.targetId;
    dto.missionId = record.missionId;
    dto.correlationId = record.correlationId;
    dto.metadata = record.metadata;
    dto.createdAt = record.createdAt.toISOString();
    return dto;
  }
}
