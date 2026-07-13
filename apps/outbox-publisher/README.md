# outbox-publisher

Empty stub — Phase 1 (`docs/mvp-plan/PRD-Phase-1.md`, REQ-1.6).

Implemented in Phase 3: polls the `outbox` table (written in the same DB
transaction as mission-state changes in `apps/api`) and publishes
pending events to Kafka, using the mission ID as the partition key to
preserve per-mission ordering. See
`docs/mvp-plan/MVP_Implementation_Plan.md`, Phase 3.
