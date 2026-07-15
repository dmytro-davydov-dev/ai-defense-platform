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

/**
 * REQ-6.3: what `AuditRepository.findByMissionId` returns — the same
 * fields `RecordAuditInput` writes, plus the row's own id/timestamp.
 * `metadata` comes back as `unknown` (Prisma's `Json` maps to
 * `Prisma.JsonValue` at the delegate boundary); the controller passes it
 * through as-is rather than re-typing it, since its shape varies by
 * `action` (e.g. `mission.transition`'s `{ from, to }`).
 */
export interface AuditLogRecord {
  id: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  missionId: string | null;
  correlationId: string | null;
  metadata: unknown;
  createdAt: Date;
}
