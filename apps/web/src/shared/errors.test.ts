import { describe, expect, it } from "vitest";
import { extractErrorMessage } from "./errors";

describe("extractErrorMessage", () => {
  it("reads a NestJS-shaped error body's message", () => {
    expect(
      extractErrorMessage({
        status: 409,
        data: { message: "MISSION_ILLEGAL_TRANSITION" },
      }),
    ).toBe("MISSION_ILLEGAL_TRANSITION");
  });

  it("joins a class-validator array of messages", () => {
    expect(
      extractErrorMessage({
        status: 400,
        data: { message: ["title must be a string", "title should not be empty"] },
      }),
    ).toBe("title must be a string, title should not be empty");
  });

  it("falls back to a generic HTTP message when the body has no message", () => {
    expect(extractErrorMessage({ status: 500, data: {} })).toBe("Request failed (HTTP 500).");
  });

  it("handles a fetch-level (non-HTTP) status", () => {
    expect(extractErrorMessage({ status: "FETCH_ERROR" })).toBe("Request failed (FETCH_ERROR).");
  });

  it("reads a SerializedError's message", () => {
    expect(extractErrorMessage({ name: "Error", message: "boom" })).toBe("boom");
  });

  it("returns a default message when there is no error", () => {
    expect(extractErrorMessage(undefined)).toBe("Something went wrong.");
  });
});
