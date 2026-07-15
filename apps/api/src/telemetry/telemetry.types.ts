/**
 * REQ-7.1: mirrors the `telemetry_points` table's columns (see
 * schema.prisma's `TelemetryPoint` model comment for why this is a
 * hand-written interface, not the generated Prisma delegate —
 * `position` uses `Unsupported(...)`, so no delegate for this table
 * exists in the generated client regardless of environment).
 * `TelemetryRepository` reads/writes this shape via `$queryRaw`/
 * `$executeRaw`, exactly like `DetectionRecord`/`InsertDetectionInput`.
 */
export interface TelemetryPointInput {
  readonly capturedAt: Date;
  readonly lat: number;
  readonly lon: number;
  readonly altitudeM: number | null;
  readonly headingDeg: number | null;
  readonly speedMps: number | null;
}

export interface InsertTelemetryInput extends TelemetryPointInput {
  readonly missionId: string;
}

export interface TelemetryRecord extends TelemetryPointInput {
  readonly id: string;
  readonly missionId: string;
  readonly createdAt: Date;
}

/** REQ-7.2: thrown by the parser on malformed input — the message is safe to return to the client as-is (no internal detail leaked), same convention as MissionsService's stable error messages. */
export class TelemetryParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelemetryParseError";
  }
}
