import {
  TelemetryParseError,
  type TelemetryPointInput,
} from "./telemetry.types";

const MIN_LAT = -90;
const MAX_LAT = 90;
const MIN_LON = -180;
const MAX_LON = 180;

/**
 * REQ-7.2: parses a mission's uploaded telemetry file into ordered
 * points, no live sensor feed — batch upload only, per
 * docs/mvp-plan/PRD-Phase-7.md's MVP-slice scope.
 *
 * Format is auto-detected from the file's own content, not its
 * extension or a client-supplied hint: a payload whose first
 * non-whitespace character is `{` is parsed as a GeoJSON
 * `FeatureCollection` of `Point` features; anything else is parsed as
 * CSV. This mirrors the PRD's "CSV or GeoJSON upload" wording (Section
 * 11's open question resolved this way — supporting both rather than
 * picking one) without requiring a separate `format` query parameter.
 */
export function parseTelemetryFile(rawText: string): TelemetryPointInput[] {
  const trimmed = rawText.trimStart();
  const points = trimmed.startsWith("{")
    ? parseGeoJsonTelemetry(rawText)
    : parseCsvTelemetry(rawText);

  if (points.length === 0) {
    throw new TelemetryParseError("telemetry file contained no points");
  }

  assertStrictlyIncreasingTimestamps(points);
  return points;
}

/**
 * CSV columns (case-insensitive header, any order):
 * `timestamp,lat,lon` required; `altitude,heading,speed` optional.
 * `timestamp` must parse via `Date` (ISO-8601 recommended).
 */
function parseCsvTelemetry(rawText: string): TelemetryPointInput[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const headerLine = lines[0];
  if (!headerLine) {
    throw new TelemetryParseError("CSV telemetry file is empty");
  }

  const header = headerLine
    .split(",")
    .map((column) => column.trim().toLowerCase());
  const columnIndex = (name: string): number => header.indexOf(name);

  const timestampIdx = columnIndex("timestamp");
  const latIdx = columnIndex("lat");
  const lonIdx = columnIndex("lon");
  const altitudeIdx = columnIndex("altitude");
  const headingIdx = columnIndex("heading");
  const speedIdx = columnIndex("speed");

  if (timestampIdx === -1 || latIdx === -1 || lonIdx === -1) {
    throw new TelemetryParseError(
      "CSV telemetry header must include timestamp, lat, and lon columns",
    );
  }

  const points: TelemetryPointInput[] = [];

  for (let rowNumber = 1; rowNumber < lines.length; rowNumber += 1) {
    const line = lines[rowNumber];
    if (line === undefined) {
      continue;
    }
    const cells = line.split(",").map((cell) => cell.trim());
    if (cells.length !== header.length) {
      throw new TelemetryParseError(
        `CSV row ${rowNumber + 1} has ${cells.length} columns, expected ${header.length}`,
      );
    }

    const timestampCell = cells[timestampIdx];
    const latCell = cells[latIdx];
    const lonCell = cells[lonIdx];
    if (
      timestampCell === undefined ||
      latCell === undefined ||
      lonCell === undefined
    ) {
      throw new TelemetryParseError(
        `CSV row ${rowNumber + 1} is missing a required column`,
      );
    }

    const capturedAt = new Date(timestampCell);
    if (Number.isNaN(capturedAt.getTime())) {
      throw new TelemetryParseError(
        `CSV row ${rowNumber + 1} has an unparseable timestamp: "${timestampCell}"`,
      );
    }

    const lat = parseCoordinate(latCell, MIN_LAT, MAX_LAT, rowNumber, "lat");
    const lon = parseCoordinate(lonCell, MIN_LON, MAX_LON, rowNumber, "lon");

    points.push({
      capturedAt,
      lat,
      lon,
      altitudeM: parseOptionalNumberCell(
        cells,
        altitudeIdx,
        rowNumber,
        "altitude",
      ),
      headingDeg: parseOptionalNumberCell(
        cells,
        headingIdx,
        rowNumber,
        "heading",
      ),
      speedMps: parseOptionalNumberCell(cells, speedIdx, rowNumber, "speed"),
    });
  }

  return points;
}

function parseCoordinate(
  cell: string,
  min: number,
  max: number,
  rowNumber: number,
  fieldName: string,
): number {
  const value = Number(cell);
  if (Number.isNaN(value) || value < min || value > max) {
    throw new TelemetryParseError(
      `CSV row ${rowNumber + 1} has an invalid ${fieldName}: "${cell}"`,
    );
  }
  return value;
}

function parseOptionalNumberCell(
  cells: readonly string[],
  columnIdx: number,
  rowNumber: number,
  fieldName: string,
): number | null {
  if (columnIdx === -1) {
    return null;
  }
  const cell = cells[columnIdx];
  if (cell === undefined || cell === "") {
    return null;
  }
  const value = Number(cell);
  if (Number.isNaN(value)) {
    throw new TelemetryParseError(
      `CSV row ${rowNumber + 1} has an invalid ${fieldName}: "${cell}"`,
    );
  }
  return value;
}

interface GeoJsonPointFeature {
  // `type`/`geometry.type` are declared as `string`, not the literal
  // "Feature"/"Point", even though that's what a well-formed feature
  // has — this is untrusted input parsed from `JSON.parse`, and the
  // runtime check below (`feature.type !== "Feature"`) is the actual
  // validation; a literal type here would make TypeScript treat that
  // check as always-true/dead code instead of real validation.
  readonly type: string;
  readonly geometry?: {
    readonly type: string;
    readonly coordinates: readonly number[];
  };
  readonly properties?: Record<string, unknown>;
}

interface GeoJsonFeatureCollection {
  readonly type: "FeatureCollection";
  readonly features: readonly GeoJsonPointFeature[];
}

/**
 * Supports a `FeatureCollection` of `Point` features only (not a bare
 * `LineString`) — this is the ingestion-side format; per-point
 * timestamps require one feature per point, `properties.timestamp`
 * required on each. `GET /missions/:id/telemetry` (REQ-7.3) returns a
 * different, read-optimized shape (a single `LineString` with parallel
 * per-point property arrays) — the two are intentionally not the same
 * document shape, since ingestion and read have different ergonomics.
 */
function parseGeoJsonTelemetry(rawText: string): TelemetryPointInput[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new TelemetryParseError("telemetry file is not valid JSON");
  }

  if (!isFeatureCollection(parsed)) {
    throw new TelemetryParseError(
      'GeoJSON telemetry must be a FeatureCollection of Point features (top-level "type" must be "FeatureCollection")',
    );
  }

  const points: TelemetryPointInput[] = [];
  parsed.features.forEach((feature, index) => {
    const rowNumber = index + 1;
    if (feature.type !== "Feature" || feature.geometry?.type !== "Point") {
      throw new TelemetryParseError(
        `GeoJSON feature ${rowNumber} is not a Point feature`,
      );
    }
    const [lon, lat, altitude] = feature.geometry.coordinates;
    if (typeof lon !== "number" || typeof lat !== "number") {
      throw new TelemetryParseError(
        `GeoJSON feature ${rowNumber} has invalid coordinates`,
      );
    }
    if (lat < MIN_LAT || lat > MAX_LAT || lon < MIN_LON || lon > MAX_LON) {
      throw new TelemetryParseError(
        `GeoJSON feature ${rowNumber} has out-of-range coordinates`,
      );
    }

    const properties = feature.properties ?? {};
    const timestampValue = properties["timestamp"];
    if (
      typeof timestampValue !== "string" &&
      typeof timestampValue !== "number"
    ) {
      throw new TelemetryParseError(
        `GeoJSON feature ${rowNumber} is missing a required "properties.timestamp"`,
      );
    }
    const capturedAt = new Date(timestampValue);
    if (Number.isNaN(capturedAt.getTime())) {
      throw new TelemetryParseError(
        `GeoJSON feature ${rowNumber} has an unparseable "properties.timestamp"`,
      );
    }

    points.push({
      capturedAt,
      lat,
      lon,
      altitudeM:
        readOptionalNumberProperty(properties, "altitude") ?? altitude ?? null,
      headingDeg: readOptionalNumberProperty(properties, "heading"),
      speedMps: readOptionalNumberProperty(properties, "speed"),
    });
  });

  return points;
}

function readOptionalNumberProperty(
  properties: Record<string, unknown>,
  key: string,
): number | null {
  const value = properties[key];
  return typeof value === "number" ? value : null;
}

function isFeatureCollection(
  value: unknown,
): value is GeoJsonFeatureCollection {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "FeatureCollection" &&
    "features" in value &&
    Array.isArray((value as { features: unknown }).features)
  );
}

function assertStrictlyIncreasingTimestamps(
  points: readonly TelemetryPointInput[],
): void {
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const current = points[i];
    if (!previous || !current) {
      continue;
    }
    if (current.capturedAt.getTime() <= previous.capturedAt.getTime()) {
      throw new TelemetryParseError(
        `telemetry points must be in strictly increasing timestamp order (point ${i + 1} is not after point ${i})`,
      );
    }
  }
}
