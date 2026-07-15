import { NotFoundException } from "@nestjs/common";
import { TrainingRunsService } from "./training-runs.service";
import type { TrainingRunsRepository } from "./training-runs.repository";
import { TrainingRunValidationError } from "./training-run.types";

describe("TrainingRunsService (REQ-8.7/8.8/8.13/8.14)", () => {
  let repository: {
    insert: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
  };
  let service: TrainingRunsService;

  const validReport = {
    meanAveragePrecision: 0.7,
    perClass: [
      {
        label: "car",
        precision: 0.8,
        recall: 0.7,
        averagePrecision: 0.75,
        supportCount: 100,
      },
    ],
    flaggedClasses: [] as string[],
    failureNotes: [] as string[],
  };

  const baseInput = {
    datasetId: "dataset-1",
    datasetSplitId: "split-1",
    gitCommit: "abc123",
    hyperparameters: { epochs: 10 },
    metrics: { finalLoss: 0.1 },
    startedAt: new Date("2026-07-15T00:00:00.000Z"),
    completedAt: new Date("2026-07-15T01:00:00.000Z"),
  };

  beforeEach(() => {
    repository = {
      insert: jest
        .fn()
        .mockImplementation((input) =>
          Promise.resolve({ ...input, id: "run-1", createdAt: new Date() }),
        ),
      findAll: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
    };
    service = new TrainingRunsService(
      repository as unknown as TrainingRunsRepository,
    );
  });

  it("records a COMPLETED run with a well-formed evaluation report", async () => {
    const result = await service.record({
      ...baseInput,
      status: "COMPLETED",
      evaluationReport: validReport,
    });
    expect(result.id).toBe("run-1");
    expect(repository.insert).toHaveBeenCalled();
  });

  it("records a FAILED run with no evaluation report", async () => {
    const result = await service.record({
      ...baseInput,
      status: "FAILED",
      evaluationReport: null,
    });
    expect(result.id).toBe("run-1");
  });

  it("rejects a COMPLETED run with no evaluation report", async () => {
    await expect(
      service.record({
        ...baseInput,
        status: "COMPLETED",
        evaluationReport: null,
      }),
    ).rejects.toBeInstanceOf(TrainingRunValidationError);
    expect(repository.insert).not.toHaveBeenCalled();
  });

  it("rejects a COMPLETED run with an empty perClass array", async () => {
    await expect(
      service.record({
        ...baseInput,
        status: "COMPLETED",
        evaluationReport: { ...validReport, perClass: [] },
      }),
    ).rejects.toBeInstanceOf(TrainingRunValidationError);
  });

  it("rejects a COMPLETED run whose report is missing flaggedClasses/failureNotes arrays", async () => {
    const { flaggedClasses: _flaggedClasses, ...withoutFlagged } = validReport;
    await expect(
      service.record({
        ...baseInput,
        status: "COMPLETED",
        evaluationReport: withoutFlagged as never,
      }),
    ).rejects.toBeInstanceOf(TrainingRunValidationError);
  });

  it("getById throws NotFoundException for an unknown run", async () => {
    await expect(service.getById("missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("listAll passes the dataset filter through to the repository", async () => {
    await service.listAll("dataset-1");
    expect(repository.findAll).toHaveBeenCalledWith("dataset-1");
  });
});
