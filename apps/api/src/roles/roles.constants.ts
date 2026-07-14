/**
 * REQ-2.5: two roles for Phase 2 — `operator` (default for anyone who
 * registers) and `admin`. An `Open questions` entry in
 * docs/mvp-plan/PRD-Phase-2.md defers a broader role set (e.g. a
 * read-only `viewer`) until Phase 6's frontend needs one.
 */
export const ROLE_NAMES = {
  OPERATOR: "operator",
  ADMIN: "admin",
} as const;

export type RoleName = (typeof ROLE_NAMES)[keyof typeof ROLE_NAMES];

export const ALL_ROLE_NAMES: readonly RoleName[] = Object.values(ROLE_NAMES);
