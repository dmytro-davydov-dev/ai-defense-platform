import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import type { AuthUser } from "../../api/types";
import type { RootState } from "../../app/store";

/**
 * REQ-6.7/6.8, Section 11's resolved open question: the JWT is held in
 * `sessionStorage` (survives a page refresh within the same tab, closed
 * when the tab closes) rather than in-memory-only — the user's explicit
 * trade-off, accepting a slightly larger XSS exposure surface than
 * memory-only for better MVP-demo UX. There is no refresh-token flow
 * (stateless JWT, per Security_Baseline.md), so a token past its
 * `expiresInSeconds` still requires a fresh login — the API's 401 on an
 * expired/invalid token drives that (see apiSlice.ts's base query).
 */
const SESSION_STORAGE_KEY = "ai-defense.auth";

interface StoredSession {
  token: string;
  user: AuthUser;
}

export interface AuthState {
  token: string | null;
  user: AuthUser | null;
}

function readStoredSession(): StoredSession | null {
  const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    // Corrupt/foreign value — treat as "not logged in" rather than throwing.
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

const stored = readStoredSession();

const initialState: AuthState = {
  token: stored?.token ?? null,
  user: stored?.user ?? null,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    credentialsSet(state, action: PayloadAction<{ token: string; user: AuthUser }>) {
      state.token = action.payload.token;
      state.user = action.payload.user;
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(action.payload));
    },
    loggedOut(state) {
      state.token = null;
      state.user = null;
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    },
  },
});

export const { credentialsSet, loggedOut } = authSlice.actions;
export default authSlice.reducer;

export function selectCurrentToken(state: RootState): string | null {
  return state.auth.token;
}

export function selectCurrentUser(state: RootState): AuthUser | null {
  return state.auth.user;
}

export function selectIsAuthenticated(state: RootState): boolean {
  return state.auth.token !== null;
}

export function selectHasRole(role: string) {
  return (state: RootState): boolean =>
    state.auth.user?.roles.includes(role as AuthUser["roles"][number]) ?? false;
}
