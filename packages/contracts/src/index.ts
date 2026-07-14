/**
 * @ai-defense/contracts
 *
 * Scaffold only — Phase 1 (docs/mvp-plan/PRD-Phase-1.md, REQ-1.9). This
 * package exists so apps/web and apps/api have a shared import target
 * from day one, without inventing per-app ad-hoc DTOs.
 *
 * REQ-2.12 (docs/mvp-plan/PRD-Phase-2.md): **done**. `openapi.json` in
 * this package directory is the real, generated OpenAPI document —
 * regenerate it with `pnpm --filter @ai-defense/api run openapi:export`
 * after any controller/DTO change. It's the file
 * `@rtk-query/codegen-openapi` (or an equivalent generator) should point
 * `schemaFile` at once Phase 6's frontend exists.
 */

/**
 * Placeholder marker type. Replace with real generated domain contracts
 * (RTK Query client, request/response types) once Phase 6's frontend
 * consumes `openapi.json` above.
 */
export interface ContractsPackagePlaceholder {
  readonly phase: 2;
  readonly note: "openapi.json is real (REQ-2.12 done) — TS domain contracts still pending Phase 6";
}

export const CONTRACTS_PACKAGE_VERSION = "0.1.0" as const;
