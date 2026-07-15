import { Injectable, NotFoundException } from "@nestjs/common";
import { StorageService } from "../storage/storage.service";
import { DatasetsRepository } from "./datasets.repository";
import {
  DatasetValidationError,
  type DatasetRecord,
  type DatasetSplitRecord,
  type RegisterDatasetInput,
} from "./dataset.types";
import {
  generateDeterministicSplit,
  SplitValidationError,
  type SplitRatios,
} from "./split.util";

export interface GenerateSplitInput extends SplitRatios {
  readonly items: readonly string[];
  readonly seed?: number | undefined;
}

/**
 * PRD-Phase-8 (docs/mvp-plan/PRD-Phase-8.md) REQ-8.1-8.3: dataset
 * registry and split generation. Per Coding_Standards.md's "application
 * services orchestrate use cases," `DatasetsController` depends on this
 * stable interface, never `DatasetsRepository` directly.
 */
@Injectable()
export class DatasetsService {
  constructor(
    private readonly datasetsRepository: DatasetsRepository,
    private readonly storageService: StorageService,
  ) {}

  /**
   * REQ-8.2: rejects registration if provenance/license metadata is
   * missing — this is the platform's safety-boundary gate for training
   * data (README.md: no classified/illegally obtained/privacy-invasive
   * data), enforced before a row is ever inserted, not as an optional
   * field a caller could skip.
   */
  async register(input: RegisterDatasetInput): Promise<DatasetRecord> {
    const requiredFields: readonly (keyof RegisterDatasetInput)[] = [
      "name",
      "version",
      "storageLocation",
      "source",
      "collectionMethod",
      "license",
      "provenanceNotes",
    ];
    for (const field of requiredFields) {
      const value = input[field];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new DatasetValidationError(
          `dataset registration requires a non-empty "${field}" (REQ-8.2: provenance and license metadata are mandatory before a dataset can be used in training)`,
        );
      }
    }
    return this.datasetsRepository.insert(input);
  }

  async listAll(): Promise<DatasetRecord[]> {
    return this.datasetsRepository.findAll();
  }

  async getById(id: string): Promise<DatasetRecord> {
    const dataset = await this.datasetsRepository.findById(id);
    if (!dataset) {
      throw new NotFoundException(`dataset ${id} not found`);
    }
    return dataset;
  }

  /**
   * REQ-8.3: deterministic, seeded split generation. The three
   * resulting manifests (newline-delimited item ids) are written to
   * MinIO so a later training run fetches exactly the same lists this
   * call produced, rather than recomputing — recomputation from the
   * recorded seed would also be deterministic, but persisting the
   * output avoids depending on the *input* `items` array's order never
   * changing between calls.
   */
  async generateSplit(
    datasetId: string,
    input: GenerateSplitInput,
  ): Promise<DatasetSplitRecord> {
    await this.getById(datasetId); // 404s if the dataset doesn't exist

    const seed = input.seed ?? DEFAULT_SEED;
    let result;
    try {
      result = generateDeterministicSplit(
        input.items,
        {
          trainRatio: input.trainRatio,
          validationRatio: input.validationRatio,
          testRatio: input.testRatio,
        },
        seed,
      );
    } catch (error) {
      if (error instanceof SplitValidationError) {
        throw new DatasetValidationError(error.message);
      }
      throw error;
    }

    const bucket = this.storageService.getDatasetsBucket();
    const prefix = `${datasetId}/splits/${seed}`;
    const trainManifestObjectKey = `${prefix}/train.txt`;
    const validationManifestObjectKey = `${prefix}/validation.txt`;
    const testManifestObjectKey = `${prefix}/test.txt`;

    await Promise.all([
      this.storageService.uploadText(
        bucket,
        trainManifestObjectKey,
        result.train.join("\n"),
      ),
      this.storageService.uploadText(
        bucket,
        validationManifestObjectKey,
        result.validation.join("\n"),
      ),
      this.storageService.uploadText(
        bucket,
        testManifestObjectKey,
        result.test.join("\n"),
      ),
    ]);

    return this.datasetsRepository.insertSplit({
      datasetId,
      seed,
      trainRatio: input.trainRatio,
      validationRatio: input.validationRatio,
      testRatio: input.testRatio,
      trainCount: result.train.length,
      validationCount: result.validation.length,
      testCount: result.test.length,
      trainManifestObjectKey,
      validationManifestObjectKey,
      testManifestObjectKey,
    });
  }

  async getSplitById(id: string): Promise<DatasetSplitRecord> {
    const split = await this.datasetsRepository.findSplitById(id);
    if (!split) {
      throw new NotFoundException(`dataset split ${id} not found`);
    }
    return split;
  }
}

// Not zero/time-based on purpose — a fixed, documented default seed
// means two callers who both omit `seed` still reproduce the same
// split for the same items/ratios, matching REQ-8.3's determinism
// requirement even when the caller doesn't think to pass one.
const DEFAULT_SEED = 20260715;
