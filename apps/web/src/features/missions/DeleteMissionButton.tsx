import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import Alert from "@mui/material/Alert";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import type { Mission } from "../../api/types";
import { MISSION_STATUS, ROLE_NAMES } from "../../api/types";
import { useAppSelector } from "../../app/hooks";
import { selectHasRole } from "../auth/authSlice";
import { useDeleteMissionMutation } from "../../api/apiSlice";
import { extractErrorMessage } from "../../shared/errors";

/**
 * Soft delete, DRAFT-only — mirrors `MissionMetadataForm.tsx`'s
 * `canEdit` gating exactly (same operator-role + DRAFT-status rule
 * `apps/api`'s `MissionsService.deleteMission` enforces server-side),
 * so this control only ever appears where the request would actually
 * succeed. A mission that has left DRAFT is a record of real work, not
 * draft state, and isn't offered for deletion at all rather than
 * showing a control that would just 409.
 */
export function DeleteMissionButton({ mission }: { mission: Mission }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteMission, { isLoading, error }] = useDeleteMissionMutation();
  const navigate = useNavigate();
  const canDelete =
    useAppSelector(selectHasRole(ROLE_NAMES.OPERATOR)) && mission.status === MISSION_STATUS.DRAFT;

  if (!canDelete) {
    return null;
  }

  async function handleConfirm() {
    const result = await deleteMission(mission.id);
    if (!("error" in result)) {
      setConfirmOpen(false);
      navigate("/missions");
    }
  }

  return (
    <>
      <Button
        variant="outlined"
        color="error"
        size="small"
        startIcon={<DeleteOutlineIcon />}
        onClick={() => setConfirmOpen(true)}
        sx={{ alignSelf: "flex-start" }}
      >
        Delete mission
      </Button>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Delete "{mission.title}"?</DialogTitle>
        <DialogContent>
          {error ? <Alert severity="error">{extractErrorMessage(error)}</Alert> : null}
          <DialogContentText>
            This removes the mission from your list. Its audit history is kept. This can't be undone
            from the app.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={isLoading}
            onClick={() => void handleConfirm()}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
