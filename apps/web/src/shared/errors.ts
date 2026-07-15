import type { FetchBaseQueryError } from "@reduxjs/toolkit/query/react";
import type { SerializedError } from "@reduxjs/toolkit";

/**
 * RTK Query mutation/query errors are a union of `FetchBaseQueryError`
 * (a real HTTP response, or a fetch-level failure) and `SerializedError`
 * (something thrown before the request even went out). Every screen that
 * surfaces an error to the operator goes through this one function so
 * the message shown is consistent, instead of each component re-deriving
 * it ad hoc.
 */
export function extractErrorMessage(
  error: FetchBaseQueryError | SerializedError | undefined,
): string {
  if (!error) {
    return "Something went wrong.";
  }

  if ("status" in error) {
    // apps/api's NestJS exception filters return { message, error?, statusCode } bodies.
    const data = error.data;
    if (data && typeof data === "object" && "message" in data) {
      const message = (data as { message?: unknown }).message;
      if (typeof message === "string") {
        return message;
      }
      if (Array.isArray(message)) {
        return message.join(", ");
      }
    }
    if (typeof error.status === "number") {
      return `Request failed (HTTP ${error.status}).`;
    }
    return `Request failed (${error.status}).`;
  }

  return error.message ?? "Something went wrong.";
}
