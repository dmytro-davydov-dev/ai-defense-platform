import { useMemo } from "react";
import Timeline from "@mui/lab/Timeline";
import TimelineItem from "@mui/lab/TimelineItem";
import TimelineSeparator from "@mui/lab/TimelineSeparator";
import TimelineConnector from "@mui/lab/TimelineConnector";
import TimelineContent from "@mui/lab/TimelineContent";
import TimelineDot from "@mui/lab/TimelineDot";
import TimelineOppositeContent from "@mui/lab/TimelineOppositeContent";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import type { AuditLogEntry, Detection } from "../../api/types";

interface EventTimelineProps {
  auditEntries: AuditLogEntry[];
  detections: Detection[];
  isLoading: boolean;
}

interface TimelineRow {
  at: string;
  title: string;
  detail: string;
  kind: "audit" | "detections";
}

/**
 * REQ-6.14: merges processing milestones (surfaced as `mission.transition`
 * audit rows — every `PROCESSING_STARTED`/`COMPLETED`/`FAILED` event
 * already drives one, per REQ-3.14), other audit entries, and a
 * detections summary into one chronological view. Individual detection
 * rows aren't rendered one-per-row here (a processed mission can have
 * hundreds) — `StatsPanel`/`VideoPlayerWithOverlay` are where per-
 * detection detail belongs; this timeline gets a single summarizing
 * entry instead, placed at the first detection's persisted timestamp.
 */
export function EventTimeline({ auditEntries, detections, isLoading }: EventTimelineProps) {
  const rows = useMemo<TimelineRow[]>(() => {
    const auditRows: TimelineRow[] = auditEntries.map((entry) => ({
      at: entry.createdAt,
      title: entry.action,
      detail: entry.actorUserId ? `by ${entry.actorUserId}` : "system",
      kind: "audit",
    }));

    const detectionRows: TimelineRow[] = [];
    if (detections.length > 0) {
      const sorted = [...detections].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      const first = sorted[0];
      if (first) {
        const uniqueTracks = new Set(detections.map((d) => d.trackId)).size;
        detectionRows.push({
          at: first.createdAt,
          title: "Detections recorded",
          detail: `${detections.length} detections across ${uniqueTracks} track(s)`,
          kind: "detections",
        });
      }
    }

    return [...auditRows, ...detectionRows].sort(
      (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
    );
  }, [auditEntries, detections]);

  if (isLoading) {
    return <CircularProgress size={20} />;
  }
  if (rows.length === 0) {
    return (
      <Typography color="text.secondary" variant="body2">
        Nothing has happened on this mission yet.
      </Typography>
    );
  }

  return (
    <Timeline sx={{ p: 0, m: 0 }}>
      {rows.map((row, index) => (
        <TimelineItem key={`${row.at}-${index}`}>
          <TimelineOppositeContent color="text.secondary" variant="caption">
            {new Date(row.at).toLocaleTimeString()}
          </TimelineOppositeContent>
          <TimelineSeparator>
            <TimelineDot color={row.kind === "detections" ? "info" : "grey"} />
            {index < rows.length - 1 ? <TimelineConnector /> : null}
          </TimelineSeparator>
          <TimelineContent>
            <Typography variant="body2">{row.title}</Typography>
            <Typography variant="caption" color="text.secondary">
              {row.detail}
            </Typography>
          </TimelineContent>
        </TimelineItem>
      ))}
    </Timeline>
  );
}
