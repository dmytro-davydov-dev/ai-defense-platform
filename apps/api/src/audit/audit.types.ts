export type { PrismaExecutor } from "../prisma/prisma.types";

/**
 * REQ-2.10: fields every audit record carries. All optional fields
 * explicitly include `| undefined` (not just `?:`) so callers can pass
 * through values like `req.headers[...]` (typed `string | undefined`)
 * without fighting `exactOptionalPropertyTypes`.
 */
export interface RecordAuditInput {
  /** Null/undefined for unauthenticated events (e.g. a failed login attempt for an unknown email). */
  actorUserId?: string | null | undefined;
  /** Stable, machine-readable action code, e.g. "mission.transition", "auth.login_failed". */
  action: string;
  targetType: string;
  targetId?: string | null | undefined;
  missionId?: string | null | undefined;
  correlationId?: string | null | undefined;
  metadata?: Record<string, unknown> | null | undefined;
}
