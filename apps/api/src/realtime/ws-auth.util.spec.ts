import { extractBearerToken, missionRoom } from "./ws-auth.util";

describe("extractBearerToken (REQ-6.5)", () => {
  it("prefers handshake.auth.token", () => {
    expect(
      extractBearerToken({
        auth: { token: "from-auth" },
        query: { token: "from-query" },
        headers: { authorization: "Bearer from-header" },
      }),
    ).toBe("from-auth");
  });

  it("falls back to a query parameter", () => {
    expect(
      extractBearerToken({
        query: { token: "from-query" },
        headers: {},
      }),
    ).toBe("from-query");
  });

  it("falls back to an Authorization header", () => {
    expect(
      extractBearerToken({
        headers: { authorization: "Bearer from-header" },
      }),
    ).toBe("from-header");
  });

  it("returns undefined when nothing is present", () => {
    expect(extractBearerToken({ headers: {} })).toBeUndefined();
  });

  it("ignores a non-Bearer Authorization header", () => {
    expect(
      extractBearerToken({ headers: { authorization: "Basic abc123" } }),
    ).toBeUndefined();
  });
});

describe("missionRoom", () => {
  it("namespaces a mission id into a room name", () => {
    expect(missionRoom("mission-1")).toBe("mission:mission-1");
  });
});
