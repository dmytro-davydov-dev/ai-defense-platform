import { parseTelemetryFile } from "./telemetry-parser";
import { TelemetryParseError } from "./telemetry.types";

describe("parseTelemetryFile", () => {
  describe("CSV", () => {
    it("parses a valid CSV file with all optional columns", () => {
      const csv = [
        "timestamp,lat,lon,altitude,heading,speed",
        "2026-07-15T10:00:00.000Z,37.7749,-122.4194,50,90,5.5",
        "2026-07-15T10:00:01.000Z,37.7750,-122.4193,51,91,5.6",
      ].join("\n");

      const points = parseTelemetryFile(csv);

      expect(points).toHaveLength(2);
      expect(points[0]).toEqual({
        capturedAt: new Date("2026-07-15T10:00:00.000Z"),
        lat: 37.7749,
        lon: -122.4194,
        altitudeM: 50,
        headingDeg: 90,
        speedMps: 5.5,
      });
    });

    it("parses a CSV file with only the required columns, in any header order", () => {
      const csv = [
        "lon,timestamp,lat",
        "-122.4194,2026-07-15T10:00:00.000Z,37.7749",
      ].join("\n");

      const points = parseTelemetryFile(csv);

      expect(points).toEqual([
        {
          capturedAt: new Date("2026-07-15T10:00:00.000Z"),
          lat: 37.7749,
          lon: -122.4194,
          altitudeM: null,
          headingDeg: null,
          speedMps: null,
        },
      ]);
    });

    it("rejects a CSV file missing a required column", () => {
      const csv = ["timestamp,lat", "2026-07-15T10:00:00.000Z,37.7749"].join(
        "\n",
      );

      expect(() => parseTelemetryFile(csv)).toThrow(TelemetryParseError);
      expect(() => parseTelemetryFile(csv)).toThrow(
        /must include timestamp, lat, and lon/,
      );
    });

    it("rejects a row with the wrong number of columns", () => {
      const csv = [
        "timestamp,lat,lon",
        "2026-07-15T10:00:00.000Z,37.7749",
      ].join("\n");

      expect(() => parseTelemetryFile(csv)).toThrow(
        /row 2 has 2 columns, expected 3/,
      );
    });

    it("rejects an unparseable timestamp", () => {
      const csv = ["timestamp,lat,lon", "not-a-date,37.7749,-122.4194"].join(
        "\n",
      );

      expect(() => parseTelemetryFile(csv)).toThrow(/unparseable timestamp/);
    });

    it("rejects an out-of-range latitude", () => {
      const csv = [
        "timestamp,lat,lon",
        "2026-07-15T10:00:00.000Z,999,-122.4194",
      ].join("\n");

      expect(() => parseTelemetryFile(csv)).toThrow(/invalid lat/);
    });

    it("rejects out-of-order timestamps", () => {
      const csv = [
        "timestamp,lat,lon",
        "2026-07-15T10:00:01.000Z,37.7749,-122.4194",
        "2026-07-15T10:00:00.000Z,37.7750,-122.4193",
      ].join("\n");

      expect(() => parseTelemetryFile(csv)).toThrow(
        /strictly increasing timestamp order/,
      );
    });

    it("rejects a CSV file with no data rows", () => {
      const csv = "timestamp,lat,lon";

      expect(() => parseTelemetryFile(csv)).toThrow(/no points/);
    });
  });

  describe("GeoJSON", () => {
    it("parses a valid FeatureCollection of Point features", () => {
      const geoJson = JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-122.4194, 37.7749] },
            properties: { timestamp: "2026-07-15T10:00:00.000Z", speed: 5.5 },
          },
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-122.4193, 37.775, 51] },
            properties: { timestamp: "2026-07-15T10:00:01.000Z" },
          },
        ],
      });

      const points = parseTelemetryFile(geoJson);

      expect(points).toEqual([
        {
          capturedAt: new Date("2026-07-15T10:00:00.000Z"),
          lat: 37.7749,
          lon: -122.4194,
          altitudeM: null,
          headingDeg: null,
          speedMps: 5.5,
        },
        {
          capturedAt: new Date("2026-07-15T10:00:01.000Z"),
          lat: 37.775,
          lon: -122.4193,
          altitudeM: 51,
          headingDeg: null,
          speedMps: null,
        },
      ]);
    });

    it("rejects invalid JSON", () => {
      expect(() => parseTelemetryFile("{not json")).toThrow(/not valid JSON/);
    });

    it("rejects a non-FeatureCollection payload", () => {
      const geoJson = JSON.stringify({ type: "Feature" });
      expect(() => parseTelemetryFile(geoJson)).toThrow(/FeatureCollection/);
    });

    it("rejects a feature missing a timestamp", () => {
      const geoJson = JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-122.4194, 37.7749] },
            properties: {},
          },
        ],
      });
      expect(() => parseTelemetryFile(geoJson)).toThrow(
        /missing a required "properties.timestamp"/,
      );
    });

    it("rejects out-of-order timestamps", () => {
      const geoJson = JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-122.4194, 37.7749] },
            properties: { timestamp: "2026-07-15T10:00:01.000Z" },
          },
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-122.4193, 37.775] },
            properties: { timestamp: "2026-07-15T10:00:00.000Z" },
          },
        ],
      });
      expect(() => parseTelemetryFile(geoJson)).toThrow(
        /strictly increasing timestamp order/,
      );
    });
  });
});
