import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import UnarchiveOutlinedIcon from "@mui/icons-material/UnarchiveOutlined";
import type { Mission } from "../../api/types";
import { ROLE_NAMES } from "../../api/types";
import { useAppSelector } from "../../app/hooks";
import { selectHasRole } from "../auth/authSlice";
import { useArchiveMissionMutation, useUnarchiveMissionMutation } from "../../api/apiSlice";
import { extractErrorMessage } from "../../shared/errors";

/**
 * No status restriction, unlike `DeleteMissionButton.tsx` — archiving
 * never touches state/audit trail, only default-list visibility
 * (`apps/api`'s `MissionsService.archiveMission`/`unarchiveMission`), so
 * this offers the same toggle from any mission state. Added after
 * delete's DRAFT-only restriction turned out to leave no way to get a
 * QUEUED/PROCESSING/COMPLETED/FAILED mission out of the default list.
 */
export function ArchiveMissionButton({ mission }: { mission: Mission }) {
  const canMutate = useAppSelector(selectHasRole(ROLE_NAMES.OPERATOR));
  const [archiveMission, { isLoading: isArchiving, error: archiveError }] =
    useArchiveMissionMutation();
  const [unarchiveMission, { isLoading: isUnarchiving, error: unarchiveError }] =
    useUnarchiveMissionMutation();

  if (!canMutate) {
    return null;
  }

  const isArchived = mission.archivedAt !== null;
  const isLoading = isArchiving || isUnarchiving;
  const error = archiveError ?? unarchiveError;

  return (
    <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
      {error ? <Alert severity="error">{extractErrorMessage(error)}</Alert> : null}
      <Button
        variant="outlined"
        size="small"
        startIcon={isArchived ? <UnarchiveOutlinedIcon /> : <ArchiveOutlinedIcon />}
        disabled={isLoading}
        onClick={() =>
          void (isArchived ? unarchiveMission(mission.id) : archiveMission(mission.id))
        }
      >
        {isArchived ? "Unarchive mission" : "Archive mission"}
      </Button>
    </Stack>
  );
}
