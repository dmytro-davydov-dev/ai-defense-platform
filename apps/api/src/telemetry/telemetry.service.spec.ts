import { TelemetryService } from "./telemetry.service";
import type { TelemetryRepository } from "./telemetry.repository";
import { TelemetryParseError } from "./telemetry.types";

describe("TelemetryService (REQ-7.2/7.3)", () => {
  let repository: { insertMany: jest.Mock; findByMissionId: jest.Mock };
  let service: TelemetryService;

  beforeEach(() => {
    repository = {
      insertMany: jest.fn().mockResolvedValue(undefined),
      findByMissionId: jest.fn().mockResolvedValue([]),
    };
    service = new TelemetryService(
      repository as unknown as TelemetryRepository,
    );
  });

  it("parses and persists a valid CSV file, stamping every point with the mission id", async () => {
    const csv = [
      "timestamp,lat,lon",
      "2026-07-15T10:00:00.000Z,37.7749,-122.4194",
      "2026-07-15T10:00:01.000Z,37.7750,-122.4193",
    ].join("\n");

    const result = await service.ingest("mission-1", csv);

    expect(result).toEqual({ pointCount: 2 });
    expect(repository.insertMany).toHaveBeenCalledWith([
      expect.objectContaining({
        missionId: "mission-1",
        lat: 37.7749,
        lon: -122.4194,
      }),
      expect.objectContaining({
        missionId: "mission-1",
        lat: 37.775,
        lon: -122.4193,
      }),
    ]);
  });

  it("propagates TelemetryParseError without touching the repository", async () => {
    const badCsv = "timestamp,lat\n2026-07-15T10:00:00.000Z,37.7749";

    await expect(service.ingest("mission-1", badCsv)).rejects.toBeInstanceOf(
      TelemetryParseError,
    );
    expect(repository.insertMany).not.toHaveBeenCalled();
  });

  it("reads back a mission's telemetry via the repository", async () => {
    const records = [
      {
        id: "t1",
        missionId: "mission-1",
        capturedAt: new Date("2026-07-15T10:00:00.000Z"),
        lat: 37.7749,
        lon: -122.4194,
        altitudeM: null,
        headingDeg: null,
        speedMps: null,
        createdAt: new Date("2026-07-15T10:05:00.000Z"),
      },
    ];
    repository.findByMissionId.mockResolvedValue(records);

    await expect(service.listForMission("mission-1")).resolves.toEqual(records);
    expect(repository.findByMissionId).toHaveBeenCalledWith("mission-1");
  });
});
