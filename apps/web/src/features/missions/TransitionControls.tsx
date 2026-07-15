import { useState } from "react";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import type { Mission, MissionStatus } from "../../api/types";
import { MISSION_STATUS, ROLE_NAMES } from "../../api/types";
import { useAppSelector } from "../../app/hooks";
import { selectHasRole } from "../auth/authSlice";
import { useTransitionMissionMutation } from "../../api/apiSlice";
import { legalNextStates } from "./missionStateMachine";
import { extractErrorMessage } from "../../shared/errors";

const TRANSITION_LABEL: Record<MissionStatus, string> = {
  [MISSION_STATUS.DRAFT]: "Reset to draft",
  [MISSION_STATUS.QUEUED]: "Submit for processing",
  [MISSION_STATUS.PROCESSING]: "Mark processing",
  [MISSION_STATUS.COMPLETED]: "Mark completed",
  [MISSION_STATUS.FAILED]: "Mark failed",
};

/**
 * REQ-6.10: shows only the transitions `missionStateMachine.ts` says
 * are legal from the mission's current state — mirrors
 * Mission_State_Machine.md, same as `apps/api` enforces server-side.
 * DRAFT→QUEUED is the operator-relevant one in practice (the
 * PROCESSING/COMPLETED/FAILED transitions are normally system-triggered
 * via Phase 3's Kafka consumer, REQ-3.14) — this component doesn't
 * special-case that; every legal transition gets a button, and
 * `apps/api`'s RBAC/state checks are the real authority regardless of
 * what's clickable here.
 */
export function TransitionControls({ mission }: { mission: Mission }) {
  const [transition, { isLoading, error }] = useTransitionMissionMutation();
  const [pendingState, setPendingState] = useState<MissionStatus | null>(null);
  const canMutate = useAppSelector(selectHasRole(ROLE_NAMES.OPERATOR));

  const nextStates = legalNextStates(mission.status);
  if (!canMutate || nextStates.length === 0) {
    return null;
  }

  async function handleTransition(targetState: MissionStatus) {
    setPendingState(targetState);
    await transition({ id: mission.id, body: { targetState } });
    setPendingState(null);
  }

  return (
    <Stack spacing={1}>
      {error ? <Alert severity="error">{extractErrorMessage(error)}</Alert> : null}
      <Stack direction="row" spacing={1}>
        {nextStates.map((state) => (
          <Button
            key={state}
            variant="outlined"
            size="small"
            disabled={isLoading || (state === MISSION_STATUS.QUEUED && !mission.videoObjectKey)}
            onClick={() => void handleTransition(state)}
          >
            {isLoading && pendingState === state ? "Working…" : TRANSITION_LABEL[state]}
          </Button>
        ))}
      </Stack>
    </Stack>
  );
}
