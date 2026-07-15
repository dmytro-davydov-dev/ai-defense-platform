import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Alert from "@mui/material/Alert";
import { useCreateMissionMutation } from "../../api/apiSlice";
import { extractErrorMessage } from "../../shared/errors";

interface CreateMissionDialogProps {
  open: boolean;
  onClose: () => void;
}

/** REQ-6.10: mission creation — on success, navigates straight to the new mission's detail view so the operator can immediately start the upload workflow (REQ-6.11). */
export function CreateMissionDialog({ open, onClose }: CreateMissionDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [createMission, { isLoading, error }] = useCreateMissionMutation();
  const navigate = useNavigate();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await createMission({
      title,
      ...(description ? { description } : {}),
    });
    if ("data" in result) {
      setTitle("");
      setDescription("");
      onClose();
      navigate(`/missions/${result.data.id}`);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <Box component="form" onSubmit={(event) => void handleSubmit(event)}>
        <DialogTitle>New mission</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error ? <Alert severity="error">{extractErrorMessage(error)}</Alert> : null}
            <TextField
              label="Title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              autoFocus
              fullWidth
            />
            <TextField
              label="Description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              fullWidth
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={isLoading}>
            Create
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
