import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import LinearProgress from "@mui/material/LinearProgress";
import Alert from "@mui/material/Alert";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import type { Mission } from "../../api/types";
import { MISSION_STATUS, ROLE_NAMES } from "../../api/types";
import { useAppSelector } from "../../app/hooks";
import { selectHasRole } from "../auth/authSlice";
import { useCreateMissionUploadUrlMutation } from "../../api/apiSlice";
import { extractErrorMessage } from "../../shared/errors";

/**
 * REQ-6.11: request a signed URL (REQ-2.9, already mission-scoped and
 * attaching the object key server-side), then upload the file directly
 * to MinIO with progress — `apps/api` never proxies the bytes. Uses
 * `XMLHttpRequest` rather than `fetch` specifically because `fetch`'s
 * request body has no upload-progress event; `xhr.upload.onprogress` is
 * the only standard way to show a progress bar for a PUT this size.
 */
export function UploadPanel({ mission }: { mission: Mission }) {
  const [createUploadUrl, { error: signError }] = useCreateMissionUploadUrlMutation();
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadComplete, setUploadComplete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canUpload =
    useAppSelector(selectHasRole(ROLE_NAMES.OPERATOR)) && mission.status === MISSION_STATUS.DRAFT;

  if (!canUpload) {
    return null;
  }

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file later
    if (!file) {
      return;
    }

    setUploadError(null);
    setUploadComplete(false);
    setUploadProgress(0);

    const signed = await createUploadUrl({
      id: mission.id,
      body: { fileName: file.name, contentType: file.type || "application/octet-stream" },
    });
    if (!("data" in signed)) {
      setUploadProgress(null);
      return;
    }

    try {
      await putWithProgress(signed.data.url, file, setUploadProgress);
      setUploadComplete(true);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : String(error));
    } finally {
      setUploadProgress(null);
    }
  }

  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom>
        Video upload
      </Typography>
      {mission.videoObjectKey && !uploadComplete ? (
        <Typography variant="body2" color="text.secondary" gutterBottom>
          A video is already attached ({mission.videoObjectKey}). Selecting a new file replaces it.
        </Typography>
      ) : null}
      {signError ? (
        <Alert severity="error" sx={{ mb: 1 }}>
          {extractErrorMessage(signError)}
        </Alert>
      ) : null}
      {uploadError ? (
        <Alert severity="error" sx={{ mb: 1 }}>
          {uploadError}
        </Alert>
      ) : null}
      {uploadComplete ? (
        <Alert severity="success" sx={{ mb: 1 }}>
          Upload complete — you can now submit for processing.
        </Alert>
      ) : null}

      <Stack direction="row" spacing={2} alignItems="center">
        <Button
          variant="outlined"
          size="small"
          startIcon={<UploadFileIcon />}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadProgress !== null}
        >
          Choose video file
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          hidden
          onChange={(event) => void handleFileSelected(event)}
        />
        {uploadProgress !== null ? (
          <Box sx={{ flexGrow: 1 }}>
            <LinearProgress variant="determinate" value={uploadProgress} />
          </Box>
        ) : null}
      </Stack>
    </Box>
  );
}

function putWithProgress(
  url: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed (HTTP ${xhr.status}).`));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed (network error)."));
    xhr.send(file);
  });
}
