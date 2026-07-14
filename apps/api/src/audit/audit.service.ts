import { Injectable } from "@nestjs/common";
import { AuditRepository } from "./audit.repository";
import type { PrismaExecutor, RecordAuditInput } from "./audit.types";

/**
 * REQ-2.10: append-only audit trail for every mission-lifecycle action
 * and every auth event. Thin on purpose — `AuditRepository` is the only
 * thing that touches Prisma; this service exists so callers depend on a
 * stable application-service interface rather than the repository
 * directly, per Coding_Standards.md's "application services orchestrate
 * use cases" rule.
 */
@Injectable()
export class AuditService {
  constructor(private readonly auditRepository: AuditRepository) {}

  /**
   * @param executor Pass the `tx` from an in-flight `prisma.$transaction`
   * callback to write the audit row atomically with the action it
   * records (e.g. a mission state transition, REQ-2.8). Defaults to the
   * top-level `PrismaService` for standalone events (e.g. auth, REQ-2.6).
   */
  async record(
    input: RecordAuditInput,
    executor?: PrismaExecutor,
  ): Promise<void> {
    await this.auditRepository.create(input, executor);
  }
}
