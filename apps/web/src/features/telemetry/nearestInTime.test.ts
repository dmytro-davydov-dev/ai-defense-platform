import { describe, expect, it } from "vitest";
import type { TelemetryFeature } from "../../api/types";
import { findNearestByElapsedMs, toElapsedTelemetryPoints } from "./nearestInTime";

function telemetry(timestamps: string[], coordinates: [number, number][]): TelemetryFeature {
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates },
    properties: {
      missionId: "mission-1",
      pointCount: coordinates.length,
      approximate: true,
      timestamps,
      altitudesM: coordinates.map(() => null),
      headingsDeg: coordinates.map(() => null),
      speedsMps: coordinates.map(() => null),
    },
  };
}

describe("toElapsedTelemetryPoints (REQ-7.5/7.6)", () => {
  it("converts absolute timestamps to elapsed ms from the first point", () => {
    const feature = telemetry(
      ["2026-07-15T10:00:00.000Z", "2026-07-15T10:00:01.000Z", "2026-07-15T10:00:03.000Z"],
      [
        [-122.4194, 37.7749],
        [-122.4193, 37.775],
        [-122.4192, 37.7751],
      ],
    );

    expect(toElapsedTelemetryPoints(feature)).toEqual([
      { elapsedMs: 0, lat: 37.7749, lon: -122.4194 },
      { elapsedMs: 1000, lat: 37.775, lon: -122.4193 },
      { elapsedMs: 3000, lat: 37.7751, lon: -122.4192 },
    ]);
  });

  it("returns an empty array for a mission with no telemetry", () => {
    const feature = telemetry([], []);
    expect(toElapsedTelemetryPoints(feature)).toEqual([]);
  });
});

describe("findNearestByElapsedMs (nearest-neighbor, not interpolated)", () => {
  const points = [
    { elapsedMs: 0, lat: 1, lon: 1 },
    { elapsedMs: 1000, lat: 2, lon: 2 },
    { elapsedMs: 3000, lat: 3, lon: 3 },
  ];

  it("returns the exact match when one exists", () => {
    expect(findNearestByElapsedMs(points, 1000)).toEqual({ elapsedMs: 1000, lat: 2, lon: 2 });
  });

  it("returns the nearer of two candidates, not an interpolated value", () => {
    // 1900ms is closer to the 1000ms point than the 3000ms point.
    expect(findNearestByElapsedMs(points, 1900)).toEqual({ elapsedMs: 1000, lat: 2, lon: 2 });
    // 2100ms is closer to the 3000ms point.
    expect(findNearestByElapsedMs(points, 2100)).toEqual({ elapsedMs: 3000, lat: 3, lon: 3 });
  });

  it("returns null for an empty point list", () => {
    expect(findNearestByElapsedMs([], 500)).toBeNull();
  });
});
