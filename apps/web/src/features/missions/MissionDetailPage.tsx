import { useState } from "react";
import { useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import {
  useGetMissionQuery,
  useGetTelemetryQuery,
  useListAuditLogQuery,
  useListDetectionsQuery,
} from "../../api/apiSlice";
import { extractErrorMessage } from "../../shared/errors";
import { useMissionSocket } from "../realtime/useMissionSocket";
import { MissionStatusBadge } from "./MissionStatusBadge";
import { MissionMetadataForm } from "./MissionMetadataForm";
import { DeleteMissionButton } from "./DeleteMissionButton";
import { TransitionControls } from "./TransitionControls";
import { UploadPanel } from "./UploadPanel";
import { StatsPanel } from "./StatsPanel";
import { EventTimeline } from "./EventTimeline";
import { AuditTrailView } from "./AuditTrailView";
import { VideoPlayerWithOverlay } from "../video/VideoPlayerWithOverlay";
import { MissionMap } from "../telemetry/MissionMap";
import { TelemetryUploadPanel } from "../telemetry/TelemetryUploadPanel";

type DetailTab = "overview" | "timeline" | "audit";

/** REQ-6.10/6.12/6.13/6.14/6.15/6.16: the single mission detail view — everything an operator needs about one mission lives here. */
export function MissionDetailPage() {
  const { missionId } = useParams<{ missionId: string }>();
  const [tab, setTab] = useState<DetailTab>("overview");
  const [currentTimeMs, setCurrentTimeMs] = useState(0);

  const {
    data: mission,
    isLoading: missionLoading,
    error: missionError,
  } = useGetMissionQuery(missionId ?? "", { skip: !missionId });
  const { data: detections = [], isLoading: detectionsLoading } = useListDetectionsQuery(
    missionId ?? "",
    { skip: !missionId },
  );
  const { data: auditEntries = [], isLoading: auditLoading } = useListAuditLogQuery(
    missionId ?? "",
    { skip: !missionId },
  );
  // REQ-7.3: returns an empty route (200, zero points) when nothing has been uploaded yet — MissionMap renders a "no telemetry" message for that case, not an error state.
  const { data: telemetry } = useGetTelemetryQuery(missionId ?? "", { skip: !missionId });

  const { connected } = useMissionSocket(missionId);

  if (!missionId) {
    return <Alert severity="error">No mission id in the URL.</Alert>;
  }
  if (missionLoading) {
    return <CircularProgress size={24} />;
  }
  if (missionError || !mission) {
    return (
      <Alert severity="error">
        {missionError ? extractErrorMessage(missionError) : "Mission not found."}
      </Alert>
    );
  }

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }} flexWrap="wrap">
        <Typography variant="h5">{mission.title}</Typography>
        <MissionStatusBadge status={mission.status} />
        <Chip
          size="small"
          variant="outlined"
          color={connected ? "success" : "default"}
          label={connected ? "Live" : "Reconnecting…"}
        />
      </Stack>
      {mission.description ? (
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          {mission.description}
        </Typography>
      ) : null}

      <Stack spacing={2} sx={{ mb: 3 }}>
        <MissionMetadataForm mission={mission} />
        <UploadPanel mission={mission} />
        <TelemetryUploadPanel missionId={missionId} />
        <TransitionControls mission={mission} />
        <DeleteMissionButton mission={mission} />
      </Stack>

      <Divider sx={{ mb: 2 }} />

      <Tabs value={tab} onChange={(_event, value: DetailTab) => setTab(value)} sx={{ mb: 2 }}>
        <Tab value="overview" label="Overview" />
        <Tab value="timeline" label="Event timeline" />
        <Tab value="audit" label="Audit trail" />
      </Tabs>

      {tab === "overview" ? (
        <Stack spacing={3}>
          <StatsPanel mission={mission} detections={detections} />
          <VideoPlayerWithOverlay
            mission={mission}
            detections={detections}
            onTimeUpdate={setCurrentTimeMs}
          />
          <MissionMap telemetry={telemetry} detections={detections} currentTimeMs={currentTimeMs} />
        </Stack>
      ) : null}

      {tab === "timeline" ? (
        <EventTimeline
          auditEntries={auditEntries}
          detections={detections}
          isLoading={detectionsLoading || auditLoading}
        />
      ) : null}

      {tab === "audit" ? <AuditTrailView missionId={missionId} /> : null}
    </Box>
  );
}
