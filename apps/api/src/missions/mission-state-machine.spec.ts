import { MissionStatus } from "../../generated/prisma/client";
import { isLegalMissionTransition } from "./mission-state-machine";

describe("mission state machine (REQ-2.2/2.13)", () => {
  const legalTransitions: [MissionStatus, MissionStatus][] = [
    [MissionStatus.DRAFT, MissionStatus.QUEUED],
    [MissionStatus.QUEUED, MissionStatus.PROCESSING],
    [MissionStatus.PROCESSING, MissionStatus.COMPLETED],
    [MissionStatus.PROCESSING, MissionStatus.FAILED],
    [MissionStatus.FAILED, MissionStatus.QUEUED],
  ];

  it.each(legalTransitions)("allows %s -> %s", (from, to) => {
    expect(isLegalMissionTransition(from, to)).toBe(true);
  });

  const illegalTransitions: [MissionStatus, MissionStatus][] = [
    [MissionStatus.DRAFT, MissionStatus.PROCESSING],
    [MissionStatus.DRAFT, MissionStatus.COMPLETED],
    [MissionStatus.DRAFT, MissionStatus.FAILED],
    [MissionStatus.QUEUED, MissionStatus.DRAFT],
    [MissionStatus.QUEUED, MissionStatus.COMPLETED],
    [MissionStatus.QUEUED, MissionStatus.FAILED],
    [MissionStatus.PROCESSING, MissionStatus.DRAFT],
    [MissionStatus.PROCESSING, MissionStatus.QUEUED],
    [MissionStatus.COMPLETED, MissionStatus.DRAFT],
    [MissionStatus.COMPLETED, MissionStatus.QUEUED],
    [MissionStatus.COMPLETED, MissionStatus.PROCESSING],
    [MissionStatus.COMPLETED, MissionStatus.FAILED],
    [MissionStatus.FAILED, MissionStatus.DRAFT],
    [MissionStatus.FAILED, MissionStatus.PROCESSING],
    [MissionStatus.FAILED, MissionStatus.COMPLETED],
  ];

  it.each(illegalTransitions)("rejects %s -> %s", (from, to) => {
    expect(isLegalMissionTransition(from, to)).toBe(false);
  });

  it("COMPLETED and DRAFT are dead ends/entry points with no self-transitions", () => {
    expect(
      isLegalMissionTransition(
        MissionStatus.COMPLETED,
        MissionStatus.COMPLETED,
      ),
    ).toBe(false);
    expect(
      isLegalMissionTransition(MissionStatus.DRAFT, MissionStatus.DRAFT),
    ).toBe(false);
  });
});
