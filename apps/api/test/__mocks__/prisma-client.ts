/**
 * Jest-only stand-in for `generated/prisma/client` (see the
 * `moduleNameMapper` entry in `package.json`'s `jest` config).
 *
 * The real generated client (`prisma generate`, REQ-2.1) emits an
 * `import.meta.url` reference for its own `__dirname` shim, which is
 * valid ESM but unparseable by ts-jest's CommonJS-mode transform
 * (`SyntaxError: Cannot use 'import.meta' outside a module`) — plain
 * `node dist/main.js` doesn't hit this because Node 22+ auto-detects
 * ESM syntax in ambiguous `.js` files, but Jest's own module loader
 * doesn't get that same native-Node treatment.
 *
 * None of this project's unit tests construct a real `PrismaService` —
 * every test mocks the repository/service layer above it — so this
 * stub only needs to satisfy static `import`s, not real query
 * behavior. `MissionStatus` is a real, exact copy of the generated
 * enum (see generated/prisma/enums.ts) since app code reads its values
 * (`MissionStatus.DRAFT`, etc.) at runtime, not just as a type.
 */
export class PrismaClient {}

export const MissionStatus = {
  DRAFT: "DRAFT",
  QUEUED: "QUEUED",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;

export type MissionStatus = (typeof MissionStatus)[keyof typeof MissionStatus];

// `Prisma.*` is only ever used as a type (`Prisma.TransactionClient`,
// `Prisma.InputJsonValue`) — erased by `import type`, so no runtime
// value is needed here.
export type Prisma = unknown;
