/**
 * PRD-Phase-8 (docs/mvp-plan/PRD-Phase-8.md) REQ-8.3: deterministic,
 * seeded train/validation/test split generation over a dataset's item
 * manifest. Pure and dependency-free on purpose — no RNG library, no
 * I/O — so `DatasetsService` can call it synchronously and this file's
 * own unit tests (REQ-8.15) can assert exact, reproducible output
 * without mocking anything.
 *
 * "Deterministic" here means: the same `items` array, `ratios`, and
 * `seed` always produce byte-identical train/validation/test lists,
 * regardless of when or on which machine this runs — the property
 * REQ-8.3 requires so a training run can be reproduced later from the
 * recorded seed alone.
 */

const RATIO_SUM_EPSILON = 1e-6;

export interface SplitRatios {
  readonly trainRatio: number;
  readonly validationRatio: number;
  readonly testRatio: number;
}

export interface SplitResult {
  readonly train: readonly string[];
  readonly validation: readonly string[];
  readonly test: readonly string[];
}

export class SplitValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SplitValidationError";
  }
}

/**
 * A small, dependency-free seeded PRNG (mulberry32) — good enough for
 * deterministic shuffling, not for anything cryptographic. Chosen over
 * pulling in a random-number-generator package specifically to keep
 * this utility at zero new dependencies, per
 * docs/adr/ADR-008-experiment-tracking-and-dataset-versioning.md's
 * "Simplicity over Complexity" reasoning applied throughout Phase 8.
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function validateRatios(ratios: SplitRatios): void {
  const { trainRatio, validationRatio, testRatio } = ratios;
  for (const [name, value] of Object.entries({
    trainRatio,
    validationRatio,
    testRatio,
  })) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new SplitValidationError(
        `${name} must be a finite number between 0 and 1 (got ${value})`,
      );
    }
  }
  const sum = trainRatio + validationRatio + testRatio;
  if (Math.abs(sum - 1) > RATIO_SUM_EPSILON) {
    throw new SplitValidationError(
      `trainRatio + validationRatio + testRatio must sum to 1 (got ${sum})`,
    );
  }
}

/**
 * @param items Dataset item identifiers (e.g. image filenames). Must be
 * non-empty and duplicate-free — a manifest with repeated ids would
 * silently let the same item land in two different splits.
 * @param seed Any 32-bit integer. The same seed with the same `items`
 * and `ratios` always reproduces the same split.
 */
export function generateDeterministicSplit(
  items: readonly string[],
  ratios: SplitRatios,
  seed: number,
): SplitResult {
  if (items.length === 0) {
    throw new SplitValidationError("items must not be empty");
  }
  const uniqueCount = new Set(items).size;
  if (uniqueCount !== items.length) {
    throw new SplitValidationError(
      `items must not contain duplicates (found ${items.length - uniqueCount} duplicate(s))`,
    );
  }
  validateRatios(ratios);

  const rng = mulberry32(seed);
  const shuffled = [...items];
  // Fisher-Yates, driven by the seeded PRNG — the only source of
  // non-input-order-derived randomness anywhere in this function.
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const a = shuffled[i];
    const b = shuffled[j];
    if (a === undefined || b === undefined) {
      continue; // unreachable for i,j within bounds; keeps tsc's noUncheckedIndexedAccess happy
    }
    shuffled[i] = b;
    shuffled[j] = a;
  }

  // floor (not round) for train/validation, remainder to test — guarantees
  // the three counts always sum to items.length exactly, with no risk of
  // a negative test count from rounding up train+validation past the total.
  const trainCount = Math.floor(items.length * ratios.trainRatio);
  const validationCount = Math.floor(items.length * ratios.validationRatio);
  const testCount = items.length - trainCount - validationCount;

  return {
    train: shuffled.slice(0, trainCount),
    validation: shuffled.slice(trainCount, trainCount + validationCount),
    test: shuffled.slice(
      trainCount + validationCount,
      trainCount + validationCount + testCount,
    ),
  };
}
