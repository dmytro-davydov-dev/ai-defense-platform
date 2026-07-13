import { log } from "@ai-defense/observability";

/**
 * Empty stub — Phase 1 (docs/mvp-plan/PRD-Phase-1.md, REQ-1.6).
 *
 * Implemented in Phase 3 (docs/mvp-plan/MVP_Implementation_Plan.md):
 * polls the `outbox` table written in the same DB transaction as
 * mission-state changes, and publishes pending rows to Kafka using the
 * mission ID as partition key, with idempotent/at-least-once delivery
 * semantics.
 */
function main(): void {
  log("info", "outbox-publisher stub — no-op until Phase 3");
}

main();
