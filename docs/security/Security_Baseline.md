---
title: Security Baseline
type: security
tags: [security, phase1, phase3]
status: accepted
---

# Security Baseline

Per the "Security baseline" cross-cutting concern in
`docs/mvp-plan/MVP_Implementation_Plan.md`: no secrets in the repo from
day one, even before there's anything sensitive to protect. JWT auth,
signed storage URLs and least-privilege service accounts are Phase 2;
full OIDC, mTLS and threat modeling remain Phase 10.

## What exists today

- **No hardcoded secrets** (REQ-1.18): every credential used by
  `infrastructure/compose/docker-compose.yml` (`POSTGRES_PASSWORD`,
  `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`) is sourced from `.env`, with
  required variables using Compose's `:?` syntax so the stack refuses to
  start silently with a blank credential.
- `.env.example` is committed and documents every variable the stack
  needs; `.env` itself is gitignored.
- `.gitignore` excludes `.env*`, build output, and local data volumes.
- Conventional Commits + small, reviewable PRs (`docs/CONTRIBUTING.md`) keep
  the audit trail on `main` legible — a prerequisite for the append-only
  audit logging Phase 2 adds at the application layer.

## What's here now

- `AuthModule` (REQ-2.4/2.5/2.6): JWT-based auth, bcrypt password
  hashing, `operator`/`admin` RBAC via `JwtAuthGuard` + `RolesGuard`. See
  [[API_Shell]] for the module breakdown.
- Every mutating endpoint in `apps/api` — mission CRUD/transitions,
  storage upload/download URLs — requires a valid JWT; mutating routes
  additionally require the `operator` or `admin` role.
- Every mission-lifecycle action and auth event (register, login
  success/failure, token issuance) writes an append-only `audit_log` row
  (REQ-2.10) via `AuditModule`.
- `StorageModule`'s upload/download endpoints are no longer
  unauthenticated — the gap flagged below (previously open) is closed.
- Phase 3's Kafka consumers (`apps/api`'s
  `processing-events.handler.ts`) call `MissionsService.transition()`
  with no HTTP actor — `ActionContext.actorUserId` is now
  `string | undefined` specifically to allow this. The resulting
  `audit_log` row has `actor_user_id: null`, same as the pre-existing
  failed-login case (REQ-2.6) — a system-triggered transition is
  distinguishable from an operator-triggered one by that null, not by a
  separate flag. No new authentication surface was added: Kafka
  consumers run inside `apps/api`'s own process, trusted the same way
  its own outbox-publisher's writes already are.

## What's deliberately not here yet

- No dependency/container vulnerability scanning in CI yet; no SBOM.
  Full supply-chain controls remain Phase 10.
- RBAC is two flat roles (`operator`, `admin`) — no finer-grained
  authorization (e.g. mission ownership checks, a read-only `viewer`
  role) until Phase 6's frontend surfaces a concrete need, per
  [[PRD-Phase-2]]'s open questions.
- JWTs are verified statelessly — a role change or account disable takes
  effect on the user's next login, not immediately. Full OIDC/session
  revocation remains Phase 10.

------------------------------------------------------------------------

## Related Notes

- [[PRD-Phase-1]] — REQ-1.18.
- [[PRD-Phase-3]] — REQ-3.14's system-triggered transitions.
- [[MVP_Implementation_Plan]] — "Security baseline" cross-cutting
  concern; Phase 2 (JWT auth); Phase 10 (full hardening).
- [[Local_Development_Stack]] — where `.env`/secrets handling is wired.
- [[Local_Kafka_Redpanda]] — the Kafka consumers this note's new entry covers.
