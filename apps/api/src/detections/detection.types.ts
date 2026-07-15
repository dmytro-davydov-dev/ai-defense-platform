/**
 * REQ-6.1: mirrors `DetectionPublishedPayload`
 * (packages/event-schemas/src/payloads.ts) plus the row's own id/
 * createdAt. Kept as a hand-written interface — not derived from the
 * generated Prisma client — for the same reason mission.types.ts's
 * `MissionRecord` is: `DetectionsRepository` reads/writes this table via
 * `$queryRaw`/`$executeRaw` (see schema.prisma's comment on the new
 * `Detection` model), never a generated delegate.
 */
export interface DetectionBoundingBoxInput {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface InsertDetectionInput {
  readonly missionId: string;
  readonly frameIndex: number;
  readonly frameTimestampMs: number;
  readonly trackId: number;
  readonly label: string;
  readonly confidence: number;
  readonly boundingBox: DetectionBoundingBoxInput;
}

export interface DetectionRecord extends InsertDetectionInput {
  readonly id: string;
  readonly createdAt: Date;
}
