import type { TelemetryFeature } from "../../api/types";

export interface ElapsedTelemetryPoint {
  readonly elapsedMs: number;
  readonly lat: number;
  readonly lon: number;
}

/**
 * REQ-7.5/7.6: converts a `TelemetryFeature`'s absolute `capturedAt`
 * timestamps into elapsed-milliseconds-from-first-point, so they can
 * be compared against a video's own playback clock (`currentTime * 1000`)
 * or a detection's `frameTimestampMs` — both of which are relative to
 * the start of the video, not to any wall-clock timestamp.
 *
 * **Explicit assumption, not a guarantee**: this only works if the
 * mission's video recording and its telemetry log started at the same
 * moment. Nothing in this phase's data model enforces that — there is
 * no shared "recording start" field tying a mission's video to its
 * telemetry's first point. This is the simplest workable assumption
 * for the MVP slice (per docs/mvp-plan/PRD-Phase-7.md's "basic timeline
 * sync, not full interpolation-based replay"); if a mission's video and
 * telemetry log actually started at different times, every position
 * this produces is offset by that difference — one more reason
 * REQ-7.7's "approximate" labeling is a hard requirement, not a nicety.
 */
export function toElapsedTelemetryPoints(telemetry: TelemetryFeature): ElapsedTelemetryPoint[] {
  const { coordinates } = telemetry.geometry;
  const { timestamps } = telemetry.properties;

  const firstTimestamp = timestamps[0];
  if (coordinates.length === 0 || firstTimestamp === undefined) {
    return [];
  }
  const firstMs = new Date(firstTimestamp).getTime();

  const points: ElapsedTelemetryPoint[] = [];
  coordinates.forEach((coordinate, index) => {
    const [lon, lat] = coordinate;
    const timestamp = timestamps[index];
    if (timestamp === undefined) {
      return;
    }
    points.push({
      elapsedMs: new Date(timestamp).getTime() - firstMs,
      lat,
      lon,
    });
  });
  return points;
}

/**
 * Nearest-neighbor match only — not interpolated — per
 * docs/mvp-plan/PRD-Phase-7.md's Section 4 non-goals. Returns `null`
 * for an empty list rather than throwing, so callers (map rendering,
 * video-scrub sync) can simply skip drawing a marker.
 */
export function findNearestByElapsedMs(
  points: readonly ElapsedTelemetryPoint[],
  targetElapsedMs: number,
): ElapsedTelemetryPoint | null {
  let nearest: ElapsedTelemetryPoint | null = null;
  let nearestDiff = Number.POSITIVE_INFINITY;

  for (const point of points) {
    const diff = Math.abs(point.elapsedMs - targetElapsedMs);
    if (diff < nearestDiff) {
      nearest = point;
      nearestDiff = diff;
    }
  }
  return nearest;
}
