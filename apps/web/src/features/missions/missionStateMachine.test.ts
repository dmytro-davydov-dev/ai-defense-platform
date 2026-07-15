import { describe, expect, it } from "vitest";
import { MISSION_STATUS } from "../../api/types";
import { legalNextStates } from "./missionStateMachine";

describe("legalNextStates (REQ-6.10, mirrors apps/api's mission-state-machine.ts)", () => {
  it("allows DRAFT -> QUEUED only", () => {
    expect(legalNextStates(MISSION_STATUS.DRAFT)).toEqual([MISSION_STATUS.QUEUED]);
  });

  it("allows QUEUED -> PROCESSING only", () => {
    expect(legalNextStates(MISSION_STATUS.QUEUED)).toEqual([MISSION_STATUS.PROCESSING]);
  });

  it("allows PROCESSING -> COMPLETED or FAILED", () => {
    expect(legalNextStates(MISSION_STATUS.PROCESSING)).toEqual([
      MISSION_STATUS.COMPLETED,
      MISSION_STATUS.FAILED,
    ]);
  });

  it("allows no transitions out of COMPLETED", () => {
    expect(legalNextStates(MISSION_STATUS.COMPLETED)).toEqual([]);
  });

  it("allows FAILED -> QUEUED (retry)", () => {
    expect(legalNextStates(MISSION_STATUS.FAILED)).toEqual([MISSION_STATUS.QUEUED]);
  });
});
