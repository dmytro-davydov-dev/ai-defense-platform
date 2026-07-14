import { withBoundedRetry } from "./retry.util";

describe("withBoundedRetry (REQ-3.9)", () => {
  it("returns true on the first successful attempt without retrying", async () => {
    const fn = jest.fn().mockResolvedValue(undefined);
    const onAttemptFailed = jest.fn();

    const result = await withBoundedRetry(
      fn,
      { attempts: 3, baseDelayMs: 1 },
      onAttemptFailed,
    );

    expect(result).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onAttemptFailed).not.toHaveBeenCalled();
  });

  it("retries up to the configured attempt count then reports failure", async () => {
    const fn = jest.fn().mockRejectedValue(new Error("boom"));
    const onAttemptFailed = jest.fn();

    const result = await withBoundedRetry(
      fn,
      { attempts: 3, baseDelayMs: 1 },
      onAttemptFailed,
    );

    expect(result).toBe(false);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onAttemptFailed).toHaveBeenCalledTimes(3);
    expect(onAttemptFailed).toHaveBeenNthCalledWith(1, 1, expect.any(Error));
    expect(onAttemptFailed).toHaveBeenNthCalledWith(3, 3, expect.any(Error));
  });

  it("succeeds on a later attempt after earlier ones fail", async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error("first fails"))
      .mockResolvedValueOnce(undefined);

    const result = await withBoundedRetry(
      fn,
      { attempts: 3, baseDelayMs: 1 },
      jest.fn(),
    );

    expect(result).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
