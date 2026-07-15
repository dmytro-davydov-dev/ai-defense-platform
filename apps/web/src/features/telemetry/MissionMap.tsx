import { useEffect, useMemo, useRef } from "react";
import { LngLatBounds, Map as MapLibreMap, Marker } from "maplibre-gl";
import type { GeoJSONSource, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import type { Detection, TelemetryFeature } from "../../api/types";
import { findNearestByElapsedMs, toElapsedTelemetryPoints } from "./nearestInTime";

/**
 * REQ-7.4/ADR-007: a raster-only style with no vector tiles, no API
 * key, and no account requirement — see
 * docs/adr/ADR-007-map-library-choice.md for why (Mapbox GL JS
 * requires a token; this doesn't). Rendering the tile *images*
 * requires outbound internet access to `tile.openstreetmap.org`; the
 * route/marker layers below do not and remain visible either way.
 */
const OSM_RASTER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    "osm-raster": {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm-raster-layer", type: "raster", source: "osm-raster" }],
};

interface MissionMapProps {
  telemetry: TelemetryFeature | undefined;
  detections: Detection[];
  /** Elapsed ms from the start of video playback — see nearestInTime.ts's documented start-alignment assumption. */
  currentTimeMs: number;
}

/**
 * REQ-7.5/7.6/7.7: renders a mission's route as a line layer, plots
 * each detection at its nearest-in-time telemetry position, and moves
 * a current-position marker as `currentTimeMs` (lifted from
 * `VideoPlayerWithOverlay`) changes. No `react-map-gl` wrapper — this
 * codebase integrates small libraries directly (see
 * `VideoPlayerWithOverlay.tsx`'s raw `<canvas>` overlay for the same
 * pattern), and ADR-007 already settled the library choice itself.
 */
export function MissionMap({ telemetry, detections, currentTimeMs }: MissionMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const currentPositionMarkerRef = useRef<Marker | null>(null);
  const loadedRef = useRef(false);

  const elapsedPoints = useMemo(
    () => (telemetry ? toElapsedTelemetryPoints(telemetry) : []),
    [telemetry],
  );

  const detectionMarkerFeatures = useMemo(() => {
    if (elapsedPoints.length === 0) {
      return [];
    }
    return detections
      .map((detection) => {
        const nearest = findNearestByElapsedMs(elapsedPoints, detection.frameTimestampMs);
        if (!nearest) {
          return null;
        }
        return {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [nearest.lon, nearest.lat] },
          properties: {
            label: detection.label,
            trackId: detection.trackId,
            confidence: detection.confidence,
          },
        };
      })
      .filter((feature): feature is NonNullable<typeof feature> => feature !== null);
  }, [detections, elapsedPoints]);

  // Mount the map once. Data (route/markers) is applied in the effects
  // below, gated on the map's own "load" event — MapLibre can't accept
  // addSource/addLayer calls before the style has finished loading.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const map = new MapLibreMap({
      container,
      style: OSM_RASTER_STYLE,
      center: [0, 0],
      zoom: 1,
    });
    mapRef.current = map;
    map.on("load", () => {
      loadedRef.current = true;
      map.addSource("route", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        paint: { "line-color": "#4fc3f7", "line-width": 3 },
      });
      map.addSource("detection-points", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "detection-points-layer",
        type: "circle",
        source: "detection-points",
        paint: {
          "circle-radius": 5,
          "circle-color": "#ff9800",
          "circle-stroke-color": "#0b1015",
          "circle-stroke-width": 1,
        },
      });
    });

    return () => {
      currentPositionMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
    // Intentionally mount-once (empty deps): the map instance itself
    // never depends on props, only refs — the data pushed into it via
    // the effects below is what actually depends on `telemetry`/
    // `detections`/`currentTimeMs`.
  }, []);

  // Route + detection markers + fit-bounds — re-applied whenever the
  // underlying telemetry/detections change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) {
      return;
    }
    // Cast rather than duck-type check `getSource`'s general `Source`
    // return type — both sources were declared `type: "geojson"` at
    // `addSource` time above, so `GeoJSONSource` is guaranteed, not
    // merely hoped for.
    const routeSource = map.getSource("route") as GeoJSONSource | undefined;
    const pointsSource = map.getSource("detection-points") as GeoJSONSource | undefined;
    if (!routeSource || !pointsSource) {
      return;
    }

    routeSource.setData({
      type: "Feature",
      geometry: telemetry?.geometry ?? { type: "LineString", coordinates: [] },
      properties: {},
    });
    pointsSource.setData({ type: "FeatureCollection", features: detectionMarkerFeatures });

    if (elapsedPoints.length > 0) {
      const bounds = new LngLatBounds();
      for (const point of elapsedPoints) {
        bounds.extend([point.lon, point.lat]);
      }
      map.fitBounds(bounds, { padding: 40, maxZoom: 16, animate: false });
    }
  }, [telemetry, detectionMarkerFeatures, elapsedPoints]);

  // Current-position marker, synced to video scrub position.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) {
      return;
    }
    const nearest = findNearestByElapsedMs(elapsedPoints, currentTimeMs);
    if (!nearest) {
      currentPositionMarkerRef.current?.remove();
      currentPositionMarkerRef.current = null;
      return;
    }
    currentPositionMarkerRef.current ??= new Marker({ color: "#f44336" }).addTo(map);
    currentPositionMarkerRef.current.setLngLat([nearest.lon, nearest.lat]);
  }, [currentTimeMs, elapsedPoints]);

  if (!telemetry || elapsedPoints.length === 0) {
    return (
      <Typography color="text.secondary" variant="body2">
        No telemetry uploaded for this mission yet.
      </Typography>
    );
  }

  return (
    <Box>
      <Chip
        size="small"
        color="warning"
        variant="outlined"
        label="Approximate position — estimated from telemetry, never verified targeting data"
        sx={{ mb: 1 }}
      />
      <Box
        ref={containerRef}
        sx={{ height: 360, width: "100%", borderRadius: 1, overflow: "hidden" }}
      />
    </Box>
  );
}
