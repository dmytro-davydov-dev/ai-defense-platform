# outbox-publisher

Transactional Outbox publisher — PRD-Phase-3 (`docs/mvp-plan/PRD-Phase-3.md`)
REQ-3.7. Polls the `outbox` table (written in the same DB transaction as
mission-state changes in `apps/api`'s `MissionsService.transition()`,
REQ-3.6) and publishes unpublished rows to `aidefense.commands`, keyed
by mission ID (REQ-3.2) to preserve per-mission ordering.

Talks to Postgres directly via `pg` (not apps/api's Prisma
client/schema) and to Kafka via `kafkajs` — a separately deployable app
per `docs/architecture/Repository_Structure.md`, not a library consumer
of `apps/api`.

## Environment

| Variable                   | Required | Default | Notes                                      |
| --------------------------- | -------- | ------- | -------------------------------------------- |
| `DATABASE_URL`               | yes      | —       | Same Postgres apps/api uses.                 |
| `KAFKA_BROKERS`               | yes      | —       | Comma-separated `host:port` list.            |
| `OUTBOX_POLL_INTERVAL_MS`      | no       | `1000`  | Sleep between poll cycles when idle.         |
| `OUTBOX_BATCH_SIZE`             | no       | `20`    | Rows claimed per poll cycle.                 |

## Delivery semantics

At-least-once: a batch's claim + Kafka publish + `published_at` update
happen in one Postgres transaction (`FOR UPDATE SKIP LOCKED` so multiple
replicas never double-claim a row); if any row's publish fails, the
whole batch rolls back and retries next cycle, which can redeliver a row
Kafka already received. Consumers make that safe via the
`processed_events` idempotency check (REQ-3.8) — see
`apps/vision-service`'s and `apps/api`'s Kafka consumers.

## Local dev

```bash
pnpm --filter @ai-defense/outbox-publisher build
pnpm --filter @ai-defense/outbox-publisher test
pnpm --filter @ai-defense/outbox-publisher start
```
