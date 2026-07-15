/**
 * RTK Query mutation/query errors are typically a union of
 * `FetchBaseQueryError` (a real HTTP response, or a fetch-level failure)
 * and `SerializedError` (something thrown before the request even went
 * out). But callers reach this function from two different shapes: RTK
 * Query's typed `error` state (already narrowed to that union) and a
 * `try/catch` around `.unwrap()`, where the catch variable is only ever
 * typed as `unknown`. Accepting `unknown` here and narrowing internally
 * covers both without every catch site needing its own cast — every
 * screen that surfaces an error to the operator goes through this one
 * function so the message shown is consistent.
 */
export function extractErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "Something went wrong.";
  }

  if ("status" in error) {
    const status: unknown = (error as { status: unknown }).status;
    // apps/api's NestJS exception filters return { message, error?, statusCode } bodies.
    const data: unknown = "data" in error ? (error as { data: unknown }).data : undefined;
    if (data && typeof data === "object" && "message" in data) {
      const message = (data as { message?: unknown }).message;
      if (typeof message === "string") {
        return message;
      }
      if (Array.isArray(message)) {
        return message.join(", ");
      }
    }
    if (typeof status === "number") {
      return `Request failed (HTTP ${status}).`;
    }
    return `Request failed (${String(status)}).`;
  }

  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : "Something went wrong.";
}
