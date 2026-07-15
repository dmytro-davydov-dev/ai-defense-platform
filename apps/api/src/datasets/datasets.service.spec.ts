import { NotFoundException } from "@nestjs/common";
import { DatasetsService } from "./datasets.service";
import type { DatasetsRepository } from "./datasets.repository";
import type { StorageService } from "../storage/storage.service";
import { DatasetValidationError } from "./dataset.types";

describe("DatasetsService (REQ-8.1-8.3)", () => {
  let repository: {
    insert: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    insertSplit: jest.Mock;
    findSplitById: jest.Mock;
  };
  let storage: { getDatasetsBucket: jest.Mock; uploadText: jest.Mock };
  let service: DatasetsService;

  const validInput = {
    name: "coastal-vehicles",
    version: "v1",
    storageLocation: "datasets/coastal-vehicles-v1/",
    source: "synthetic simulation pipeline",
    collectionMethod: "rendered from approved scenarios",
    license: "CC-BY-4.0",
    provenanceNotes: "synthetic only, no real-world imagery",
  };

  beforeEach(() => {
    repository = {
      insert: jest.fn().mockImplementation((input) =>
        Promise.resolve({
          ...input,
          id: "dataset-1",
          createdAt: new Date("2026-07-15T00:00:00.000Z"),
          updatedAt: new Date("2026-07-15T00:00:00.000Z"),
        }),
      ),
      findAll: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      insertSplit: jest.fn().mockImplementation((input) =>
        Promise.resolve({
          ...input,
          id: "split-1",
          createdAt: new Date("2026-07-15T00:00:00.000Z"),
        }),
      ),
      findSplitById: jest.fn().mockResolvedValue(null),
    };
    storage = {
      getDatasetsBucket: jest.fn().mockReturnValue("datasets"),
      uploadText: jest.fn().mockResolvedValue(undefined),
    };
    service = new DatasetsService(
      repository as unknown as DatasetsRepository,
      storage as unknown as StorageService,
    );
  });

  describe("register (REQ-8.1/8.2)", () => {
    it("registers a dataset with complete provenance/license metadata", async () => {
      const result = await service.register(validInput);
      expect(result.id).toBe("dataset-1");
      expect(repository.insert).toHaveBeenCalledWith(validInput);
    });

    it.each([
      "provenanceNotes",
      "license",
      "source",
      "collectionMethod",
      "name",
      "version",
      "storageLocation",
    ] as const)("rejects registration when %s is missing", async (field) => {
      const invalid = { ...validInput, [field]: "" };
      await expect(service.register(invalid)).rejects.toBeInstanceOf(
        DatasetValidationError,
      );
      expect(repository.insert).not.toHaveBeenCalled();
    });

    it("rejects registration when a required field is only whitespace", async () => {
      await expect(
        service.register({ ...validInput, license: "   " }),
      ).rejects.toBeInstanceOf(DatasetValidationError);
    });
  });

  describe("getById", () => {
    it("throws NotFoundException for an unknown dataset", async () => {
      await expect(service.getById("missing")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("generateSplit (REQ-8.3)", () => {
    it("404s if the dataset doesn't exist", async () => {
      await expect(
        service.generateSplit("missing", {
          items: ["a", "b"],
          trainRatio: 0.5,
          validationRatio: 0.5,
          testRatio: 0,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("generates a deterministic split, uploads three manifests, and persists the split record", async () => {
      repository.findById.mockResolvedValue({ id: "dataset-1", ...validInput });
      const items = Array.from({ length: 10 }, (_, i) => `item-${i}`);

      const result = await service.generateSplit("dataset-1", {
        items,
        trainRatio: 0.6,
        validationRatio: 0.2,
        testRatio: 0.2,
        seed: 1,
      });

      expect(
        result.trainCount + result.validationCount + result.testCount,
      ).toBe(10);
      expect(storage.uploadText).toHaveBeenCalledTimes(3);
      expect(repository.insertSplit).toHaveBeenCalledWith(
        expect.objectContaining({ datasetId: "dataset-1", seed: 1 }),
      );
    });

    it("is deterministic across two calls with the same seed", async () => {
      repository.findById.mockResolvedValue({ id: "dataset-1", ...validInput });
      const items = Array.from({ length: 10 }, (_, i) => `item-${i}`);
      const splitInput = {
        items,
        trainRatio: 0.6,
        validationRatio: 0.2,
        testRatio: 0.2,
        seed: 7,
      };

      await service.generateSplit("dataset-1", splitInput);
      await service.generateSplit("dataset-1", splitInput);

      const firstCall = storage.uploadText.mock.calls[0] as
        [string, string, string] | undefined;
      const secondCall = storage.uploadText.mock.calls[3] as
        [string, string, string] | undefined;
      const firstCallManifest = firstCall?.[2];
      const secondCallManifest = secondCall?.[2];
      expect(firstCallManifest).toEqual(secondCallManifest);
    });

    it("translates a SplitValidationError (e.g. bad ratios) into a DatasetValidationError", async () => {
      repository.findById.mockResolvedValue({ id: "dataset-1", ...validInput });
      await expect(
        service.generateSplit("dataset-1", {
          items: ["a", "b"],
          trainRatio: 0.5,
          validationRatio: 0.5,
          testRatio: 0.5,
        }),
      ).rejects.toBeInstanceOf(DatasetValidationError);
    });
  });

  describe("getSplitById", () => {
    it("throws NotFoundException for an unknown split", async () => {
      await expect(service.getSplitById("missing")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
