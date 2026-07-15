import { generateDeterministicSplit, SplitValidationError } from "./split.util";

describe("generateDeterministicSplit", () => {
  const items = Array.from({ length: 100 }, (_, i) => `item-${i}`);
  const ratios = { trainRatio: 0.7, validationRatio: 0.2, testRatio: 0.1 };

  it("is deterministic for the same items/ratios/seed", () => {
    const first = generateDeterministicSplit(items, ratios, 42);
    const second = generateDeterministicSplit(items, ratios, 42);
    expect(first).toEqual(second);
  });

  it("produces a different order for a different seed", () => {
    const first = generateDeterministicSplit(items, ratios, 1);
    const second = generateDeterministicSplit(items, ratios, 2);
    expect(first.train).not.toEqual(second.train);
  });

  it("splits counts matching the given ratios (within flooring)", () => {
    const result = generateDeterministicSplit(items, ratios, 7);
    expect(result.train).toHaveLength(70);
    expect(result.validation).toHaveLength(20);
    expect(result.test).toHaveLength(10);
  });

  it("every item appears in exactly one split, none dropped or duplicated", () => {
    const result = generateDeterministicSplit(items, ratios, 7);
    const combined = [...result.train, ...result.validation, ...result.test];
    expect(combined).toHaveLength(items.length);
    expect(new Set(combined)).toEqual(new Set(items));
  });

  it("rejects an empty item list", () => {
    expect(() => generateDeterministicSplit([], ratios, 1)).toThrow(
      SplitValidationError,
    );
  });

  it("rejects duplicate items", () => {
    expect(() =>
      generateDeterministicSplit(["a", "b", "a"], ratios, 1),
    ).toThrow(SplitValidationError);
  });

  it("rejects ratios that don't sum to 1", () => {
    expect(() =>
      generateDeterministicSplit(
        items,
        { trainRatio: 0.5, validationRatio: 0.2, testRatio: 0.2 },
        1,
      ),
    ).toThrow(SplitValidationError);
  });

  it("rejects an out-of-range ratio", () => {
    expect(() =>
      generateDeterministicSplit(
        items,
        { trainRatio: 1.5, validationRatio: -0.3, testRatio: -0.2 },
        1,
      ),
    ).toThrow(SplitValidationError);
  });

  it("handles a ratio set that rounds counts to exactly cover a small item list", () => {
    const result = generateDeterministicSplit(
      ["a", "b", "c", "d", "e"],
      { trainRatio: 0.6, validationRatio: 0.2, testRatio: 0.2 },
      99,
    );
    expect(result.train).toHaveLength(3);
    expect(result.validation).toHaveLength(1);
    expect(result.test).toHaveLength(1);
  });
});
