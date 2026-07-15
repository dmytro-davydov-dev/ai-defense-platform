import { beforeEach, describe, expect, it } from "vitest";
import authReducer, { credentialsSet, loggedOut } from "./authSlice";
import type { AuthState } from "./authSlice";
import type { AuthUser } from "../../api/types";

const user: AuthUser = {
  id: "user-1",
  email: "a@b.com",
  displayName: "A B",
  roles: ["operator"],
};

const emptyState: AuthState = { token: null, user: null };

describe("authSlice (REQ-6.7/6.8)", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("stores the token/user on credentialsSet and persists to sessionStorage", () => {
    const next = authReducer(emptyState, credentialsSet({ token: "jwt-token", user }));

    expect(next).toEqual({ token: "jwt-token", user });
    expect(sessionStorage.getItem("ai-defense.auth")).toBe(
      JSON.stringify({ token: "jwt-token", user }),
    );
  });

  it("clears the token/user on loggedOut and removes the sessionStorage entry", () => {
    const loggedInState = authReducer(emptyState, credentialsSet({ token: "jwt-token", user }));

    const next = authReducer(loggedInState, loggedOut());

    expect(next).toEqual(emptyState);
    expect(sessionStorage.getItem("ai-defense.auth")).toBeNull();
  });
});
