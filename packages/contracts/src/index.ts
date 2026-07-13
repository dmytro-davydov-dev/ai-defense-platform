/**
 * @ai-defense/contracts
 *
 * Scaffold only — Phase 1 (docs/mvp-plan/PRD-Phase-1.md, REQ-1.9). This
 * package exists so apps/web and apps/api have a shared import target
 * from day one, without inventing per-app ad-hoc DTOs.
 *
 * Populated in Phase 2 with mission/user/audit DTOs and OpenAPI-generated
 * types once apps/api's REST surface exists.
 */

/**
 * Placeholder marker type. Replace with real domain contracts in Phase 2.
 */
export interface ContractsPackagePlaceholder {
  readonly phase: 1;
  readonly note: "populated in Phase 2 — see docs/mvp-plan/PRD-Phase-1.md REQ-1.9";
}

export const CONTRACTS_PACKAGE_VERSION = "0.1.0" as const;
