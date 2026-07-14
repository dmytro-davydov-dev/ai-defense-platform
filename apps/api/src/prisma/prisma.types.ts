import type { Prisma } from "../../generated/prisma/client";
import type { PrismaService } from "./prisma.service";

/**
 * Anything with the same delegate surface as `PrismaService` — either
 * the top-level service or a `Prisma.TransactionClient` handed to a
 * `prisma.$transaction(async (tx) => ...)` callback. Repositories accept
 * this so a caller (an application service) can pass `tx` to make
 * several repository calls atomic, per ADR-004-nestjs-orm.md's
 * `$transaction` guidance — e.g. a mission status update and its audit
 * row (REQ-2.8) landing in the same DB transaction.
 */
export type PrismaExecutor = PrismaService | Prisma.TransactionClient;
