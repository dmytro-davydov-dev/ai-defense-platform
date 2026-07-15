import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { ROLE_NAMES } from "../../api/types";
import { useAppSelector } from "../../app/hooks";
import { selectHasRole } from "../auth/authSlice";
import { useUploadTelemetryMutation } from "../../api/apiSlice";
import { extractErrorMessage } from "../../shared/errors";

/**
 * REQ-7.2: batch telemetry upload (CSV or GeoJSON — format is
 * auto-detected server-side, see
 * apps/api/src/telemetry/telemetry-parser.ts). No live sensor feed —
 * this is the only way telemetry enters the system in the MVP slice.
 */
export function TelemetryUploadPanel({ missionId }: { missionId: string }) {
  const [uploadTelemetry, { isLoading }] = useUploadTelemetryMutation();
  const [result, setResult] = useState<{ pointCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canUpload = useAppSelector(selectHasRole(ROLE_NAMES.OPERATOR));
  if (!canUpload) {
    return null;
  }

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file later
    if (!file) {
      return;
    }
    setError(null);
    setResult(null);
    try {
      const response = await uploadTelemetry({ id: missionId, file }).unwrap();
      setResult({ pointCount: response.pointCount });
    } catch (uploadError) {
      setError(extractErrorMessage(uploadError));
    }
  }

  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom>
        Telemetry upload
      </Typography>
      {error ? (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      ) : null}
      {result ? (
        <Alert severity="success" sx={{ mb: 1 }}>
          Ingested {result.pointCount} telemetry point{result.pointCount === 1 ? "" : "s"}.
        </Alert>
      ) : null}
      <Stack direction="row" spacing={2} alignItems="center">
        <Button
          variant="outlined"
          size="small"
          startIcon={<UploadFileIcon />}
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
        >
          Upload CSV or GeoJSON
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.geojson,.json,text/csv,application/geo+json,application/json"
          hidden
          onChange={(event) => void handleFileSelected(event)}
        />
        {isLoading ? <CircularProgress size={20} /> : null}
      </Stack>
    </Box>
  );
}
