/** REQ-3.9: bounded retry with exponential backoff, shared by every Kafka consumer in this app. */
export interface RetryOptions {
  readonly attempts: number;
  readonly baseDelayMs: number;
}

/**
 * Calls `fn` up to `options.attempts` times, backing off
 * `baseDelayMs * 2^(attempt-1)` between tries. Returns `true` the
 * moment `fn` succeeds, `false` once every attempt has failed — the
 * caller decides what "give up" means (REQ-3.10's dead-letter publish).
 * Never throws: a failing `fn` is reported via `onAttemptFailed`, not
 * a rejected promise, so a consumer's message loop can't crash on a
 * single bad message.
 */
export async function withBoundedRetry(
  fn: () => Promise<void>,
  options: RetryOptions,
  onAttemptFailed: (attempt: number, error: unknown) => void,
): Promise<boolean> {
  for (let attempt = 1; attempt <= options.attempts; attempt++) {
    try {
      await fn();
      return true;
    } catch (error) {
      onAttemptFailed(attempt, error);
      if (attempt < options.attempts) {
        await sleep(options.baseDelayMs * 2 ** (attempt - 1));
      }
    }
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
