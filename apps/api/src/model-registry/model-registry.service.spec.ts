import { NotFoundException } from "@nestjs/common";
import { ModelRegistryService } from "./model-registry.service";
import type { ModelRegistryRepository } from "./model-registry.repository";
import type { TrainingRunsService } from "../training-runs/training-runs.service";
import type { AuditService } from "../audit/audit.service";
import { ModelRegistryValidationError } from "./model-registry.types";

function makeModel(overrides: Record<string, unknown> = {}) {
  return {
    id: "model-1",
    trainingRunId: "run-1",
    objectKey: "model-1/model.onnx",
    stage: "CANDIDATE",
    createdAt: new Date("2026-07-15T00:00:00.000Z"),
    promotedAt: null,
    promotedById: null,
    ...overrides,
  };
}

describe("ModelRegistryService (REQ-8.9-8.12)", () => {
  let repository: {
    insert: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    findProduction: jest.Mock;
    findMostRecentlyDemotedProduction: jest.Mock;
    setStage: jest.Mock;
    runInTransaction: jest.Mock;
  };
  let trainingRunsService: { getById: jest.Mock };
  let auditService: { record: jest.Mock };
  let service: ModelRegistryService;

  beforeEach(() => {
    repository = {
      insert: jest
        .fn()
        .mockImplementation((input: Record<string, unknown>) =>
          Promise.resolve(makeModel(input)),
        ),
      findAll: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      findProduction: jest.fn().mockResolvedValue(null),
      findMostRecentlyDemotedProduction: jest.fn().mockResolvedValue(null),
      setStage: jest.fn().mockResolvedValue(undefined),
      runInTransaction: jest
        .fn()
        .mockImplementation((fn: (executor: undefined) => Promise<unknown>) =>
          fn(undefined),
        ),
    };
    trainingRunsService = {
      getById: jest
        .fn()
        .mockResolvedValue({ id: "run-1", status: "COMPLETED" }),
    };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };

    service = new ModelRegistryService(
      repository as unknown as ModelRegistryRepository,
      trainingRunsService as unknown as TrainingRunsService,
      auditService as unknown as AuditService,
    );
  });

  describe("register (REQ-8.9)", () => {
    it("registers a model against a COMPLETED training run", async () => {
      const result = await service.register({
        trainingRunId: "run-1",
        objectKey: "model-1/model.onnx",
      });
      expect(result.stage).toBe("CANDIDATE");
      expect(repository.insert).toHaveBeenCalled();
    });

    it("rejects registration against a non-COMPLETED training run", async () => {
      trainingRunsService.getById.mockResolvedValue({
        id: "run-1",
        status: "FAILED",
      });
      await expect(
        service.register({ trainingRunId: "run-1", objectKey: "x" }),
      ).rejects.toBeInstanceOf(ModelRegistryValidationError);
      expect(repository.insert).not.toHaveBeenCalled();
    });
  });

  describe("promote (REQ-8.10)", () => {
    it("promotes a model with no prior production model and audits it", async () => {
      repository.findById.mockResolvedValue(makeModel({ id: "model-1" }));
      repository.findProduction.mockResolvedValue(null);

      const result = await service.promote("model-1", "user-1");

      expect(repository.setStage).toHaveBeenCalledWith(
        "model-1",
        "PRODUCTION",
        expect.objectContaining({ promotedById: "user-1" }),
        undefined,
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "model.promoted",
          targetType: "model_version",
          targetId: "model-1",
          metadata: { fromModelId: null, toModelId: "model-1" },
        }),
        undefined,
      );
      expect(result.id).toBe("model-1");
    });

    it("demotes the current production model to STAGED before promoting the new one", async () => {
      repository.findById.mockResolvedValue(makeModel({ id: "model-2" }));
      repository.findProduction.mockResolvedValue(
        makeModel({ id: "model-1", stage: "PRODUCTION" }),
      );

      await service.promote("model-2", "user-1");

      expect(repository.setStage).toHaveBeenCalledWith(
        "model-1",
        "STAGED",
        null,
        undefined,
      );
      expect(repository.setStage).toHaveBeenCalledWith(
        "model-2",
        "PRODUCTION",
        expect.any(Object),
        undefined,
      );
    });

    it("404s promoting an unknown model", async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.promote("missing", "user-1")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("rollback (REQ-8.11)", () => {
    it("rolls back to an explicit toVersionId, audited as model.rolled_back", async () => {
      repository.findById.mockResolvedValue(makeModel({ id: "model-1" }));
      repository.findProduction.mockResolvedValue(
        makeModel({ id: "model-2", stage: "PRODUCTION" }),
      );

      const result = await service.rollback("user-1", "model-1");

      expect(result.id).toBe("model-1");
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "model.rolled_back" }),
        undefined,
      );
    });

    it("rolls back to the most recently demoted production model when no target is given", async () => {
      repository.findProduction.mockResolvedValue(
        makeModel({ id: "model-2", stage: "PRODUCTION" }),
      );
      repository.findMostRecentlyDemotedProduction.mockResolvedValue(
        makeModel({ id: "model-1", stage: "STAGED", promotedAt: new Date() }),
      );
      repository.findById.mockResolvedValue(
        makeModel({ id: "model-1", stage: "PRODUCTION" }),
      );

      const result = await service.rollback("user-1");

      expect(result.id).toBe("model-1");
      expect(repository.findMostRecentlyDemotedProduction).toHaveBeenCalledWith(
        "model-2",
        undefined,
      );
    });

    it("404s when there is no prior production version to roll back to", async () => {
      repository.findProduction.mockResolvedValue(null);
      repository.findMostRecentlyDemotedProduction.mockResolvedValue(null);

      await expect(service.rollback("user-1")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
