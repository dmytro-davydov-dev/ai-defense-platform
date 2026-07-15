import Chip from "@mui/material/Chip";
import type { ChipProps } from "@mui/material/Chip";
import type { MissionStatus } from "../../api/types";
import { MISSION_STATUS } from "../../api/types";

const STATUS_COLOR: Record<MissionStatus, NonNullable<ChipProps["color"]>> = {
  [MISSION_STATUS.DRAFT]: "default",
  [MISSION_STATUS.QUEUED]: "info",
  [MISSION_STATUS.PROCESSING]: "warning",
  [MISSION_STATUS.COMPLETED]: "success",
  [MISSION_STATUS.FAILED]: "error",
};

/** REQ-6.9: the one place a mission's status renders — every list/detail view uses this instead of a bespoke label. */
export function MissionStatusBadge({ status }: { status: MissionStatus }) {
  return <Chip label={status} color={STATUS_COLOR[status]} size="small" variant="outlined" />;
}
