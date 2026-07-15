import type { MissionStatus } from "../../api/types";
import { MISSION_STATUS } from "../../api/types";

/**
 * REQ-6.10: mirrors `apps/api/src/missions/mission-state-machine.ts`
 * exactly — kept in sync by hand (small, stable table; a mismatch would
 * only ever show/hide a button optimistically, never bypass the API's
 * own enforcement, since `MissionsService.transition()` re-validates
 * this same table server-side regardless of what the UI offers).
 */
export const LEGAL_MISSION_TRANSITIONS: Readonly<Record<MissionStatus, readonly MissionStatus[]>> =
  {
    [MISSION_STATUS.DRAFT]: [MISSION_STATUS.QUEUED],
    [MISSION_STATUS.QUEUED]: [MISSION_STATUS.PROCESSING],
    [MISSION_STATUS.PROCESSING]: [MISSION_STATUS.COMPLETED, MISSION_STATUS.FAILED],
    [MISSION_STATUS.COMPLETED]: [],
    [MISSION_STATUS.FAILED]: [MISSION_STATUS.QUEUED],
  };

export function legalNextStates(from: MissionStatus): readonly MissionStatus[] {
  return LEGAL_MISSION_TRANSITIONS[from];
}
