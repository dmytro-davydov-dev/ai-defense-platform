import { Injectable } from "@nestjs/common";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { PrismaExecutor, RecordAuditInput } from "./audit.types";

/**
 * Coding_Standards.md: "repositories hide persistence details." The only
 * place `prisma.auditLog` is touched directly. Append-only by design —
 * there is intentionally no `update`/`delete` method here (REQ-2.10).
 */
@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    input: RecordAuditInput,
    executor: PrismaExecutor = this.prisma,
  ) {
    return executor.auditLog.create({
      data: {
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        missionId: input.missionId ?? null,
        correlationId: input.correlationId ?? null,
        ...(input.metadata
          ? { metadata: input.metadata as Prisma.InputJsonValue }
          : {}),
      },
    });
  }
}
