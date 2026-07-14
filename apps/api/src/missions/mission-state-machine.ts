import { MissionStatus } from "../../generated/prisma/client";

/**
 * REQ-2.2/2.8: the mission lifecycle, per
 * docs/architecture/Mission_State_Machine.md. Pure domain logic — no
 * Prisma, no Nest — so it can be unit-tested in isolation (REQ-2.13) and
 * reused wherever a legality check is needed without pulling in a DB
 * dependency. `MissionsService.transition()` is the only caller that
 * turns an illegal transition into an HTTP-facing error.
 */
export const LEGAL_MISSION_TRANSITIONS: Readonly<
  Record<MissionStatus, readonly MissionStatus[]>
> = {
  [MissionStatus.DRAFT]: [MissionStatus.QUEUED],
  [MissionStatus.QUEUED]: [MissionStatus.PROCESSING],
  [MissionStatus.PROCESSING]: [MissionStatus.COMPLETED, MissionStatus.FAILED],
  [MissionStatus.COMPLETED]: [],
  [MissionStatus.FAILED]: [MissionStatus.QUEUED],
};

export function isLegalMissionTransition(
  from: MissionStatus,
  to: MissionStatus,
): boolean {
  return LEGAL_MISSION_TRANSITIONS[from].includes(to);
}

/** Stable, machine-readable error code per Coding_Standards.md — not a free-text message. */
export const MISSION_ILLEGAL_TRANSITION_CODE = "MISSION_ILLEGAL_TRANSITION";
