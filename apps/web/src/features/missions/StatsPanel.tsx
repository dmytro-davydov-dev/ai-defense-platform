import { useMemo } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import type { Detection, Mission } from "../../api/types";

interface StatsPanelProps {
  mission: Mission;
  detections: Detection[];
}

/**
 * REQ-6.15: basic filters/summary statistics — detections by class and
 * mission duration. Duration is derived from `createdAt`/`updatedAt`
 * (both already on `MissionResponseDto`) rather than the pipeline's own
 * `processingDurationMs` — that field is emitted on the
 * `PROCESSING_COMPLETED` Kafka event but isn't persisted anywhere
 * `apps/api` can read back yet (see docs/roadmap/Progress.md's Phase 6
 * Known gaps); `updatedAt - createdAt` is a reasonable proxy for the
 * MVP and needs no further backend work.
 */
export function StatsPanel({ mission, detections }: StatsPanelProps) {
  const countsByLabel = useMemo(() => {
    const counts = new Map<string, number>();
    for (const detection of detections) {
      counts.set(detection.label, (counts.get(detection.label) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [detections]);

  const uniqueTrackCount = useMemo(
    () => new Set(detections.map((detection) => detection.trackId)).size,
    [detections],
  );

  const durationSeconds = Math.max(
    0,
    (new Date(mission.updatedAt).getTime() - new Date(mission.createdAt).getTime()) / 1000,
  );

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={3}>
        <Stat label="Detections" value={detections.length} />
        <Stat label="Unique tracks" value={uniqueTrackCount} />
        <Stat label="Elapsed" value={formatDuration(durationSeconds)} />
      </Stack>

      {countsByLabel.length > 0 ? (
        <Box>
          <Typography variant="caption" color="text.secondary">
            Detections by class
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 0.5 }}>
            {countsByLabel.map(([label, count]) => (
              <Chip key={label} label={`${label}: ${count}`} size="small" />
            ))}
          </Stack>
        </Box>
      ) : null}
    </Stack>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Box>
      <Typography variant="h6" component="div">
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}m ${seconds}s`;
}
