import { useState } from "react";
import type { FormEvent } from "react";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import type { Mission } from "../../api/types";
import { MISSION_STATUS, ROLE_NAMES } from "../../api/types";
import { useAppSelector } from "../../app/hooks";
import { selectHasRole } from "../auth/authSlice";
import { useUpdateMissionMetadataMutation } from "../../api/apiSlice";
import { extractErrorMessage } from "../../shared/errors";

/** REQ-6.10: metadata is only ever editable while DRAFT (`apps/api`'s `MissionsService.updateMetadata` enforces the same rule; this just avoids offering a control that would 409). */
export function MissionMetadataForm({ mission }: { mission: Mission }) {
  const [title, setTitle] = useState(mission.title);
  const [description, setDescription] = useState(mission.description ?? "");
  const [updateMetadata, { isLoading, error }] = useUpdateMissionMetadataMutation();
  const canEdit =
    useAppSelector(selectHasRole(ROLE_NAMES.OPERATOR)) && mission.status === MISSION_STATUS.DRAFT;

  if (!canEdit) {
    return null;
  }

  const isDirty = title !== mission.title || description !== (mission.description ?? "");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await updateMetadata({ id: mission.id, body: { title, description } });
  }

  return (
    <Stack
      component="form"
      onSubmit={(event) => void handleSubmit(event)}
      spacing={2}
      sx={{ maxWidth: 480 }}
    >
      {error ? <Alert severity="error">{extractErrorMessage(error)}</Alert> : null}
      <TextField
        label="Title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        size="small"
        fullWidth
      />
      <TextField
        label="Description"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        size="small"
        fullWidth
        multiline
        minRows={2}
      />
      <Button
        type="submit"
        variant="outlined"
        size="small"
        disabled={!isDirty || isLoading}
        sx={{ alignSelf: "flex-start" }}
      >
        Save changes
      </Button>
    </Stack>
  );
}
