import { useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import type { Detection, Mission } from "../../api/types";
import { useLazyGetDownloadUrlQuery } from "../../api/apiSlice";
import { extractErrorMessage } from "../../shared/errors";

/** Detections within this many ms of the current playback position are drawn — a tolerance window, not an exact frame match, since the browser doesn't expose the source video's fps directly. */
const OVERLAY_WINDOW_MS = 80;

/** Phase 5's `storage/minio_client.py`'s `upload_from()` uploads here — deterministic, not random-suffixed, so the frontend can derive it without a dedicated field (see docs/roadmap/Progress.md's Phase 6 Known gaps on REQ-6.4). */
function annotatedVideoObjectKey(missionId: string): string {
  return `missions/${missionId}/annotated.mp4`;
}

interface VideoPlayerWithOverlayProps {
  mission: Mission;
  detections: Detection[];
  /** REQ-7.6: lets `MissionMap` sync a current-position marker to this video's own playback clock, without either component owning the other's state. */
  onTimeUpdate?: (currentTimeMs: number) => void;
}

/** REQ-6.13: video player + detection overlay, canvas-drawn and synced to `<video>`'s own playback clock via `requestAnimationFrame` (not a fixed-interval timer, so it never falls out of sync with real playback rate/seeking). */
export function VideoPlayerWithOverlay({
  mission,
  detections,
  onTimeUpdate,
}: VideoPlayerWithOverlayProps) {
  const [source, setSource] = useState<"raw" | "annotated">(
    mission.videoObjectKey ? "raw" : "annotated",
  );
  const [fetchDownloadUrl, downloadState] = useLazyGetDownloadUrlQuery();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const objectKey = source === "raw" ? mission.videoObjectKey : annotatedVideoObjectKey(mission.id);

  useEffect(() => {
    setVideoUrl(null);
    if (!objectKey) {
      return;
    }
    let cancelled = false;
    void fetchDownloadUrl(objectKey)
      .unwrap()
      .then((result) => {
        if (!cancelled) {
          setVideoUrl(result.url);
        }
      })
      .catch(() => {
        // surfaced via downloadState.error below
      });
    return () => {
      cancelled = true;
    };
  }, [objectKey, fetchDownloadUrl]);

  const detectionsByWindow = useMemo(
    () => [...detections].sort((a, b) => a.frameTimestampMs - b.frameTimestampMs),
    [detections],
  );

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    function draw() {
      if (!video || !canvas || !ctx) {
        return;
      }
      canvas.width = video.clientWidth;
      canvas.height = video.clientHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Overlay-source detections are only drawn over the raw video —
      // Phase 5's annotated artifact already has boxes baked into the
      // frames, so drawing again would double them up.
      if (source === "raw" && video.videoWidth > 0) {
        const currentMs = video.currentTime * 1000;
        const scaleX = canvas.width / video.videoWidth;
        const scaleY = canvas.height / video.videoHeight;

        for (const detection of detectionsByWindow) {
          if (Math.abs(detection.frameTimestampMs - currentMs) <= OVERLAY_WINDOW_MS) {
            drawDetection(ctx, detection, scaleX, scaleY);
          }
        }
      }

      animationFrameRef.current = requestAnimationFrame(draw);
    }

    animationFrameRef.current = requestAnimationFrame(draw);
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [detectionsByWindow, source]);

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="subtitle2">Video</Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={source}
          onChange={(_event, value: "raw" | "annotated" | null) => {
            if (value) {
              setSource(value);
            }
          }}
        >
          <ToggleButton value="raw" disabled={!mission.videoObjectKey}>
            Live overlay
          </ToggleButton>
          <ToggleButton value="annotated">Pre-annotated (Phase 5)</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {downloadState.isFetching ? <CircularProgress size={20} /> : null}
      {downloadState.error ? (
        <Alert severity="error">{extractErrorMessage(downloadState.error)}</Alert>
      ) : null}
      {!objectKey ? (
        <Typography color="text.secondary" variant="body2">
          No video attached yet.
        </Typography>
      ) : null}

      {videoUrl ? (
        <Box sx={{ position: "relative", maxWidth: 720 }}>
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            onTimeUpdate={(event) => onTimeUpdate?.(event.currentTarget.currentTime * 1000)}
            style={{ width: "100%", display: "block" }}
          />
          <canvas
            ref={canvasRef}
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              width: "100%",
              height: "100%",
            }}
          />
        </Box>
      ) : null}
    </Box>
  );
}

function drawDetection(
  ctx: CanvasRenderingContext2D,
  detection: Detection,
  scaleX: number,
  scaleY: number,
): void {
  const { boundingBox } = detection;
  const x = boundingBox.x * scaleX;
  const y = boundingBox.y * scaleY;
  const width = boundingBox.width * scaleX;
  const height = boundingBox.height * scaleY;

  ctx.strokeStyle = "#4fc3f7";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, height);

  const label = `${detection.label} #${detection.trackId} (${Math.round(detection.confidence * 100)}%)`;
  ctx.font = "12px sans-serif";
  const textWidth = ctx.measureText(label).width;
  ctx.fillStyle = "rgba(79, 195, 247, 0.85)";
  ctx.fillRect(x, Math.max(0, y - 16), textWidth + 8, 16);
  ctx.fillStyle = "#0b1015";
  ctx.fillText(label, x + 4, Math.max(12, y - 4));
}
