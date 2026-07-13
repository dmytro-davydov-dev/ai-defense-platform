---
title: Security Baseline
type: security
tags: [security, phase1]
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

## What's deliberately not here yet

- No authentication or authorization anywhere in `apps/api` yet.
  **This is no longer a "nothing sensitive exists" situation**:
  `StorageModule` (Phase 2, REQ-2.9) issues real presigned MinIO
  upload/download URLs from unauthenticated endpoints
  (`POST /storage/upload-url`, `GET /storage/download-url`). This is a
  deliberate, temporary sequencing gap — `AuthModule`'s RBAC guard
  (REQ-2.5) is blocked on the same Prisma-generation issue documented in
  `docs/roadmap/Progress.md` Known gaps, not skipped by choice. It must
  close before Phase 2 exits; see [[API_Shell]] for the tracking note.
- No dependency/container vulnerability scanning in CI yet; no SBOM.
  Full supply-chain controls remain Phase 10.

------------------------------------------------------------------------

## Related Notes

- [[PRD-Phase-1]] — REQ-1.18.
- [[MVP_Implementation_Plan]] — "Security baseline" cross-cutting
  concern; Phase 2 (JWT auth); Phase 10 (full hardening).
- [[Local_Development_Stack]] — where `.env`/secrets handling is wired.
