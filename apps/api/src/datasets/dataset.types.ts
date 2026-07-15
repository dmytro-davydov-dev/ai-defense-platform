/**
 * PRD-Phase-8 (docs/mvp-plan/PRD-Phase-8.md) REQ-8.1/8.2/8.3: mirrors
 * the `datasets`/`dataset_splits` tables' columns (see schema.prisma's
 * `Dataset`/`DatasetSplit` model comments for why these are hand-written
 * interfaces rather than the generated Prisma delegate — same stale-
 * client reason as every model added since Phase 3).
 */
export interface RegisterDatasetInput {
  readonly name: string;
  readonly version: string;
  readonly storageLocation: string;
  readonly source: string;
  readonly collectionMethod: string;
  readonly license: string;
  readonly provenanceNotes: string;
  readonly createdById?: string | null | undefined;
}

export interface DatasetRecord extends RegisterDatasetInput {
  readonly id: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** REQ-8.2: thrown when required provenance/license metadata is missing — the validation gate is enforced here, before a row is ever inserted. */
export class DatasetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatasetValidationError";
  }
}

export interface InsertDatasetSplitInput {
  readonly datasetId: string;
  readonly seed: number;
  readonly trainRatio: number;
  readonly validationRatio: number;
  readonly testRatio: number;
  readonly trainCount: number;
  readonly validationCount: number;
  readonly testCount: number;
  readonly trainManifestObjectKey: string;
  readonly validationManifestObjectKey: string;
  readonly testManifestObjectKey: string;
}

export interface DatasetSplitRecord extends InsertDatasetSplitInput {
  readonly id: string;
  readonly createdAt: Date;
}
