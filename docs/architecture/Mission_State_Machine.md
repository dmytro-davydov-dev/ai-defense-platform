---
title: Mission State Machine
type: architecture
tags: [architecture, backend, phase2]
status: accepted
---

# Mission State Machine

Per [[PRD-Phase-2]] REQ-2.2: the mission lifecycle is a small, explicit
state machine enforced in `apps/api`'s application service layer — not
a free-text status column that any update can overwrite.

## States

```text
DRAFT ──────▶ QUEUED ──────▶ PROCESSING ──┬──▶ COMPLETED
                                            └──▶ FAILED
```

| State        | Meaning                                                                 |
| ------------ | ------------------------------------------------------------------------ |
| `DRAFT`      | Mission created, metadata editable, no video attached yet or upload in progress. |
| `QUEUED`     | Operator submitted the mission for processing (Phase 3 publishes a `MISSION_PROCESSING_REQUESTED` command from here — not wired until Phase 3). |
| `PROCESSING` | The vision worker has started work (set by a future Phase 4 consumer callback — `apps/api` transitions into this state when it receives that signal, not synchronously). |
| `COMPLETED`  | Processing finished successfully; detections/artifacts exist (Phase 4/5). |
| `FAILED`     | Processing failed; mission may be resubmitted (`FAILED` → `QUEUED` is allowed; see below). |

## Legal transitions

| From         | To           | Trigger                                              |
| ------------ | ------------ | ------------------------------------------------------ |
| `DRAFT`      | `QUEUED`     | Operator submits the mission (requires a video attached via the signed-upload flow, REQ-2.9). |
| `QUEUED`     | `PROCESSING` | Vision worker starts (Phase 4+; stubbed/manual in Phase 2 since no consumer exists yet). |
| `PROCESSING` | `COMPLETED`  | Vision worker finishes successfully.                    |
| `PROCESSING` | `FAILED`     | Vision worker reports an unrecoverable error.           |
| `FAILED`     | `QUEUED`     | Operator resubmits after a failure.                     |

Every other transition (e.g. `DRAFT` → `PROCESSING`, `COMPLETED` →
anything) is rejected by the application service with a stable,
machine-readable error code, per `Coding_Standards.md`'s "errors use
stable machine-readable codes" rule. There is no direct `PATCH` on the
`status` field — only a dedicated transition method
(`MissionService.transition(missionId, targetState)`) performs the
check-then-write, and every successful transition writes one
`audit_log` row (REQ-2.8) tagged with the mission ID, the actor, and the
resulting state.

## Why enforce this in the service layer, not the database

A Postgres `CHECK` constraint or enum type prevents storing an invalid
*value*, but not an invalid *transition* (nothing stops a naive `UPDATE
missions SET status = 'COMPLETED' WHERE status = 'DRAFT'` at the SQL
level). The state machine's transition rules are business logic, so
they belong in `MissionService`, with the Postgres `MissionStatus` enum
(`apps/api/prisma/schema.prisma`) only guaranteeing the column can't
hold a value outside the five states above.

## What's out of scope for Phase 2

- No sub-states or progress percentages within `PROCESSING` — Phase 4/5
  events (`aidefense.processing-events`) carry granular progress; the
  mission's own `status` column stays coarse-grained.
- No automatic timeout/retry policy for missions stuck in `PROCESSING`
  — that's an operational concern for Phase 3's consumer
  crash/dead-letter handling, not this state machine.

---

## Related Notes

- [[PRD-Phase-2]] — REQ-2.2 (this document), REQ-2.7/2.8 (the
  `MissionModule` that enforces it).
- [[ADR-004-nestjs-orm]] — the Prisma schema this state machine's
  `MissionStatus` enum lives in.
- [[Coding_Standards]] — the "stable machine-readable error codes" and
  "domain logic separated from controllers" rules this design follows.
- [[MVP_Implementation_Plan]] — Phase 3 (outbox publishes from
  `QUEUED`), Phase 4 (vision worker drives `PROCESSING` →
  `COMPLETED`/`FAILED`).
