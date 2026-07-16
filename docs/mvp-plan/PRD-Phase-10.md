---
title: "PRD — Phase 10: Security Architecture"
type: prd
tags: [prd, phase10, security]
status: draft
---

# PRD — Phase 10: Security Architecture

Version: 1.0
Status: Draft
Date: 2026-07-15
Owner: Dmytro
Related documents: [[AI_Defense_Platform_Roadmap]], [[MVP_Implementation_Plan]], [[PRD-Phase-1]], [[PRD-Phase-2]], [[PRD-Phase-6]], [[PRD-Phase-8]], [[PRD-Phase-9]], [[ADR-011-device-identity-and-sync-transport]], [[Security_Baseline]], [[Quality_Attributes]], [[Initial_Risk_Register]], [[Guiding_Principles]], [[Goals]], [[Architecture_Overview]], [[Coding_Standards]], [[Repository_Structure]]

---

## 1. Summary

Phase 10 is the roadmap's "Security Architecture" phase — like Phases 8
and 9, entirely **outside MVP scope**
([[MVP_Implementation_Plan]] lists "Phase 10 (full security hardening:
mTLS, threat model, SBOM, supply-chain controls — a _baseline_ subset
ships inside Phases 1–3)" under "Explicitly deferred past MVP"). It
turns the platform's Phase 1–9 security baseline — JWT auth, bcrypt
hashing, two flat RBAC roles, signed MinIO URLs, append-only audit rows,
`.env`-sourced secrets, plain-HTTP service communication inside a
trusted Compose network, and a per-device bearer token
([[ADR-011-device-identity-and-sync-transport]]) — into the roadmap's
full "harden the platform for defense-oriented data handling" scope: a
documented threat model, zero-trust service communication, OIDC and
RBAC/ABAC, mTLS, secrets management, encryption at rest and in transit,
signed artifacts, a software bill of materials (SBOM), supply-chain
controls, an immutable audit trail, and a retention/deletion policy.

This PRD is scoped against the roadmap's full "Phase 10 — Security
Architecture" entry directly, the same way [[PRD-Phase-8]] and
[[PRD-Phase-9]] were scoped against their roadmap entries rather than an
MVP slice.

## 2. Problem statement

Every prior phase's "what's deliberately not here yet" list points at
this phase by name, rather than guessing at a security posture it was
never scoped to build:

- [[Security_Baseline]] states outright: "JWT auth, signed storage URLs
  and least-privilege service accounts are Phase 2; full OIDC, mTLS and
  threat modeling remain Phase 10," and separately: "No
  dependency/container vulnerability scanning in CI yet; no SBOM. Full
  supply-chain controls remain Phase 10," and: "JWTs are verified
  statelessly — a role change or account disable takes effect on the
  user's next login, not immediately. Full OIDC/session revocation
  remains Phase 10."
- [[PRD-Phase-2]]'s own risk table records: "RBAC modeled too simply (two
  roles) undersells later access-control needs | ... Phase 10 (full
  OIDC/ABAC) is where finer-grained authorization lands" — a gap this
  platform has carried, acknowledged, since Phase 2 and never revisited
  through Phase 9.
- [[PRD-Phase-9]]'s [[ADR-011-device-identity-and-sync-transport]]
  deliberately shipped a minimal pre-provisioned bearer token for edge
  device identity, rejecting full mTLS/PKI "as premature: this platform
  has no certificate authority, no certificate lifecycle tooling, and no
  mTLS termination anywhere yet" — and that ADR's own Review date says
  to revisit "when Phase 10 ... designs platform-wide mTLS/OIDC device
  identity — this ADR's bearer-token mechanism should be migrated to, or
  wrapped by, that mechanism rather than maintained as a permanent
  parallel system." This phase is where that migration is scoped.
- Phase 8's `training/registry_client.py` and Phase 9's
  `.env.example` both document the same shortcut in almost identical
  words: a training job or edge-adjacent tool "authenticates as an
  operator/admin the same way a human does" because "this reference
  implementation deliberately defers a real machine-identity/
  service-account mechanism to Phase 10." Nothing in the platform today
  distinguishes a batch job's credential from a human operator's.
- `.env.example` and `infrastructure/compose/docker-compose.yml` are the
  platform's entire secrets story today: every credential (Postgres,
  MinIO, the JWT signing secret, the model-registry API token) is a
  plaintext value in a gitignored `.env` file, sourced by Compose's
  `environment:` blocks. There is no secrets-management system, no
  rotation mechanism, and no separation between "local dev convenience"
  and "how a real deployment would source these."
- Every inter-service connection in `infrastructure/compose/docker-
  compose.yml` — browser↔`api`, `api`↔`postgres`, `api`↔`minio`,
  `api`↔`redpanda`, `apps/vision-service`↔`redpanda`, `apps/outbox-
  publisher`↔`postgres`, edge agent↔`api` — is plain HTTP/unencrypted
  TCP inside the trusted Compose network, authenticated (where it is
  authenticated at all) only by network reachability plus, for HTTP
  routes, a bearer credential. No mTLS, and no encryption in transit
  beyond what a future TLS-terminating proxy would add, exists anywhere
  today.
- `AuditModule` (Phase 2, REQ-2.10) gives every mutating action an
  append-only row with "no update/delete path exposed" — an
  application-layer guarantee, not a cryptographically or storage-layer
  tamper-evident one. Nothing prevents a direct database write (by a
  compromised service credential or a database administrator) from
  silently altering or removing an audit row without detection — the
  roadmap's "immutable audit trail" deliverable is not yet real.
- No document in this knowledge base defines a retention or deletion
  policy for mission data, telemetry, datasets, model artifacts, device-
  synced events, or audit records — every table and MinIO bucket this
  platform has built since Phase 2 accumulates indefinitely by default.
- `.github/workflows/ci.yml`'s `docker-build` job builds five images
  (`web`, `api`, `vision-service`, `outbox-publisher`, plus `edge-agent`
  once Phase 9's Dockerfile is wired in) with no SBOM generation, no
  dependency/container vulnerability scan, and no image signing step —
  the roadmap's "signed artifacts," "software bill of materials," and
  "supply-chain controls" deliverables are entirely unbuilt.
- No formal threat model exists for this platform. [[Initial_Risk_Register]]
  names project-level risks (scope creep, model-accuracy overconfidence,
  edge connectivity, GPU portability, public-framing risk) but was never
  intended as, and does not substitute for, a structured
  asset/trust-boundary/threat-actor analysis of the architecture
  [[Architecture_Overview]] now actually describes.

## 3. Goals

- A documented threat model covering every container in
  [[Architecture_Overview]] (React Workspace, NestJS Control Plane,
  Python Vision Worker, Kafka, PostgreSQL/PostGIS, MinIO/S3, Edge
  Runtime) and their trust boundaries — assets, threat actors, attack
  surfaces, and existing/needed mitigations — reviewed against
  [[Initial_Risk_Register]] and updating it where this phase's analysis
  finds a gap that register doesn't cover.
- Zero-trust service communication: no service-to-service connection is
  trusted by network location alone (per [[Guiding_Principles]]'s
  "Zero-Trust Orientation" principle, not yet operationalized anywhere
  in the codebase). Every connection this phase can reasonably reach
  within its scope (Section 4 draws the line) is authenticated and,
  where mTLS is the chosen mechanism (Section 7), mutually authenticated
  and encrypted.
- OIDC federation for `apps/api`'s `AuthModule`, without breaking
  existing local-account login, plus working JWT/session revocation so a
  role change or account disable takes effect without waiting for
  natural token expiry — closing both gaps [[Security_Baseline]] already
  names by number.
- RBAC extended toward ABAC-capable authorization for at least the
  concrete gaps already on record ([[PRD-Phase-2]]'s risk table: mission
  ownership scoping, a read-only `viewer` role) — not a speculative
  general-purpose policy platform, per [[Guiding_Principles]]'s
  "Simplicity over Complexity."
- A real machine/service-identity mechanism that Phase 8's
  `registry_client.py` and Phase 9's edge-agent model-resolution path
  can use instead of an operator's own JWT, and a migration path for
  [[ADR-011-device-identity-and-sync-transport]]'s device bearer token
  into (or alongside) this phase's platform-wide identity mechanism, per
  that ADR's own Review date instruction.
- Secrets sourced from a dedicated secrets-management mechanism for any
  non-local-dev deployment, with `.env` remaining the local-dev
  convenience path it already is (per [[Security_Baseline]]'s existing
  "no hardcoded secrets" baseline) — not replaced, but no longer the only
  option.
- Encryption at rest for PostgreSQL/PostGIS and MinIO data, and
  encryption in transit for every HTTP path this phase brings under
  mTLS/TLS (Section 5), closing the roadmap's named "encryption at rest
  and in transit" deliverable.
- Signed build artifacts (container images at minimum), a generated SBOM
  per image, and dependency/container vulnerability scanning wired into
  `.github/workflows/ci.yml`'s existing `docker-build` job — the
  roadmap's "signed artifacts," "software bill of materials," and
  "supply-chain controls" deliverables, operationalizing
  [[Initial_Risk_Register]]'s "Sensitive data enters repository"
  mitigation ("Data policy, scanning and synthetic fixtures") into a
  concrete CI mechanism for the first time.
- A tamper-evident audit trail: harden Phase 2's `audit_log` append-only
  guarantee from an application-layer convention ("no update/delete path
  exposed") into something a storage-layer or cryptographic mechanism
  actually enforces or makes detectable if violated.
- A documented, at-least-partially-enforced retention and deletion
  policy for mission data, telemetry, datasets, model artifacts,
  device-synced events, and audit records.

## 4. Non-goals (explicitly out of scope for Phase 10)

- Kubernetes-native or service-mesh-native mTLS (Istio, Linkerd, a
  cloud-managed mesh) rolled out to a real cluster — Phase 12
  ("Kubernetes and Delivery Platform") owns actual orchestrated
  deployment. This phase designs and implements its zero-trust/mTLS
  mechanism against the existing Docker Compose target, with an explicit
  note in Section 7 on how it should carry forward to Phase 12 rather
  than being redesigned from scratch there.
- Formal compliance certification or audit evidence (FedRAMP, IL5,
  CMMC, SOC 2, or similar) — Phase 14 ("production readiness:
  SLOs, DR, compliance evidence") owns compliance attestation. This
  phase builds the underlying mechanisms (encryption, audit
  immutability, SBOM, retention) those future compliance efforts would
  need, but does not itself produce compliance documentation or pursue
  certification.
- Replacing the two-role RBAC model with a general-purpose policy engine
  (e.g., adopting OPA/Rego, Casbin, or an equivalent wholesale) unless
  the ADR in Section 7 concludes that is in fact the simplest mechanism
  available — per [[Guiding_Principles]]'s "Simplicity over Complexity,"
  the bar is resolving the concrete gaps already on record (Section 3),
  not building a speculative general authorization platform.
- Any expansion of `detection/classes.py`'s `ALLOWED_CLASSES` allow-list,
  or any change to the platform-wide safety boundary
  ([[Guiding_Principles]], `README.md`'s Safety and scope boundary) —
  hardening the platform's security posture is orthogonal to, and must
  not be used as a pretext for widening, that boundary.
- Real penetration testing, red-team engagement, or fuzzing campaigns —
  those belong to Phase 13's ("Testing and Quality Engineering," per the
  roadmap's full test-layer matrix) security test suites, or Phase 14's
  production-readiness evidence gathering. This phase produces a threat
  model and hardening mechanisms that a future pentest would evaluate,
  not the pentest itself.
- Hardware security modules (HSM) or a specific cloud KMS integration,
  unless the ADR in Section 7 concludes that is the simplest available
  option for this reference implementation's scope — a software-based
  secrets store (e.g., a self-hosted secrets manager or `.env`-file
  encryption at rest) is an acceptable Definition-of-Done outcome if the
  ADR reasons through why a full HSM/KMS is premature here, the same
  "don't over-build for a reference implementation" posture
  [[ADR-011-device-identity-and-sync-transport]] used to reject full
  mTLS/PKI for Phase 9's device identity.
- Full observability integration of new security events (alerting on
  failed-auth spikes, dashboards for revoked-token attempts, etc.) —
  Phase 11 ("Observability and Operations") owns dashboards/alerting;
  this phase's job is to produce structured, correlated security events
  a future Phase 11 dashboard can consume, not to build the dashboard.
- Autonomous target selection, weapon control, or any autonomous
  engagement logic — [[Goals]]'s "Explicitly Out of Scope" list and
  every prior phase's safety constraint apply without exception; a
  security-hardening phase does not relax it.

## 5. Requirements

### 5.1 Threat model

- REQ-10.1: A documented threat model (e.g., STRIDE- or attack-tree-
  based, resolved in Section 11) covers every container named in
  [[Architecture_Overview]] and every trust boundary between them
  (browser↔API, API↔Postgres, API↔MinIO, API↔Kafka, vision-service↔Kafka,
  outbox-publisher↔Postgres, edge agent↔API), identifying assets, threat
  actors, attack surfaces, and existing or needed mitigations. It is
  reviewed against, and cross-linked from, [[Initial_Risk_Register]],
  updating that register where this analysis surfaces a gap it does not
  already cover.

### 5.2 Zero-trust service communication and mTLS

- REQ-10.2: Every service-to-service connection this phase's threat
  model (REQ-10.1) identifies as in-scope is authenticated on its own
  terms — no connection is trusted solely because it originates from
  inside the Compose network's IP range.
- REQ-10.3: mTLS (or an equivalent authenticated, encrypted-channel
  mechanism resolved in Section 7) is implemented for at least the
  `api`↔`postgres`, `api`↔`minio`, and `api`↔`redpanda` connections, with
  a documented certificate/credential issuance and rotation story — not
  a one-time manually-generated certificate with no renewal path.
- REQ-10.4: `apps/edge-agent`'s connection to `apps/api` (Phase 9's
  device bearer token, per
  [[ADR-011-device-identity-and-sync-transport]]) has a documented
  migration path onto, or alongside, this phase's mTLS/identity
  mechanism, per that ADR's own Review date instruction — this
  requirement does not mandate ripping out the bearer token in this
  phase, only that the migration path is designed and documented.

### 5.3 Identity: OIDC and RBAC/ABAC

- REQ-10.5: `apps/api`'s `AuthModule` supports authenticating via an
  external OIDC provider (the specific provider is resolved in Section
  7), without removing or breaking existing local bcrypt+JWT accounts —
  both paths issue the same shape of JWT the rest of the platform
  already verifies, so no other module needs to change.
- REQ-10.6: A role change or account disable takes effect without
  waiting for the affected JWT's natural expiry (e.g., via short-lived
  access tokens with refresh, token introspection against a revocation
  store, or an equivalent mechanism resolved in Section 7) — closing
  [[Security_Baseline]]'s named "JWTs are verified statelessly" gap.
- REQ-10.7: RBAC is extended with at least the concrete authorization
  gaps already on record in [[PRD-Phase-2]]'s risk table (mission
  ownership scoping and/or a read-only `viewer` role), using an
  attribute-based check where a flat role cannot express the
  distinction, without replacing the existing `operator`/`admin` role
  model wholesale.
- REQ-10.8: A real machine/service-identity mechanism exists, distinct
  from both a human operator's JWT and Phase 9's edge-device bearer
  token, that Phase 8's `training/registry_client.py` and any other
  batch/automation client can use instead of reusing an operator's
  login credential — closing the gap both `registry_client.py`'s own
  module docstring and `.env.example` document as deliberately deferred
  to this phase.

### 5.4 Secrets management

- REQ-10.9: Every secret this platform currently sources from `.env`
  (Postgres/MinIO credentials, the JWT signing secret, any
  service/device tokens introduced by REQ-10.8) can instead be sourced
  from a dedicated secrets-management mechanism (resolved in Section 7)
  for any non-local-dev deployment — `.env` remains valid for local
  development, per [[Security_Baseline]]'s existing REQ-1.18 baseline,
  not deprecated by this requirement.
- REQ-10.10: Rotating a secret sourced through REQ-10.9's mechanism does
  not require a code change in the service that consumes it — only a
  restart or an equivalent, documented reload mechanism.

### 5.5 Encryption at rest and in transit

- REQ-10.11: PostgreSQL/PostGIS and MinIO data at rest are encrypted (or
  run on a documented encrypted-volume equivalent) in any deployment
  target beyond local development, where plaintext local volumes remain
  acceptable per this platform's existing local-dev posture.
- REQ-10.12: Every HTTP path this phase's threat model (REQ-10.1) and
  mTLS work (REQ-10.2–10.4) bring into scope — browser↔API at minimum —
  uses TLS rather than plain HTTP in any deployment target beyond local
  development.

### 5.6 Supply chain: signed artifacts, SBOM, and controls

- REQ-10.13: `.github/workflows/ci.yml`'s `docker-build` job generates a
  Software Bill of Materials for every built image (`web`, `api`,
  `vision-service`, `outbox-publisher`, `edge-agent`).
- REQ-10.14: CI runs dependency and container vulnerability scanning
  against every built image and the TS/Python dependency graphs, with a
  documented policy (resolved in Section 7) for what severity blocks a
  merge versus what is reported only.
- REQ-10.15: Built container images are cryptographically signed as
  part of CI, and a documented verification step confirms a signature
  before an image would be deployed — operationalizing the roadmap's
  "signed artifacts" deliverable for at least the container-image
  artifact type (model-artifact signing, building on Phase 8's model
  registry, is a candidate extension per Section 11, not mandatory here).

### 5.7 Immutable audit trail

- REQ-10.16: Phase 2's `audit_log` append-only guarantee (REQ-2.10,
  currently "no update/delete path exposed" at the application layer
  only) is hardened so that a tampered or deleted row is detectable
  (e.g., hash-chaining each row to the previous one, a database-level
  trigger/constraint rejecting `UPDATE`/`DELETE`, or an equivalent
  mechanism resolved in Section 7) — not merely relying on the
  application never exposing a mutation path.

### 5.8 Retention and deletion policy

- REQ-10.17: A documented retention and deletion policy exists for
  mission data, telemetry, datasets, model artifacts, device-synced
  events (Phase 9), and audit records, with at least one concrete
  mechanism (a scheduled job, an operator-triggered procedure, or an
  equivalent resolved in Section 11) enforcing at least one of these
  categories end-to-end, rather than the policy remaining
  documentation-only in every category.

### 5.9 Testing

- REQ-10.18: Automated tests verify this phase's key, testable
  mitigations: an unauthenticated or unauthorized request to a
  protected route is rejected; a revoked token or disabled account
  loses access without waiting for expiry (REQ-10.6); a tampered audit
  row is detectable (REQ-10.16); CI's SBOM/scanning/signing steps
  (REQ-10.13–10.15) run and produce their expected artifacts, or are
  written and gated/skippable with a documented reason if a live CI
  environment, real signing keys, or network access is unavailable in
  the environment they were authored in — the same pattern every prior
  phase's Known gaps have used.

## 6. Technical approach (ordered task list)

1. Resolve the ADRs required before implementation (Section 7): secrets-
   management tooling; OIDC provider and RBAC/ABAC mechanism; zero-
   trust/mTLS strategy for Compose; supply-chain tooling (SBOM,
   scanning, signing).
2. Write the threat model (REQ-10.1) first, before any implementation
   step below — every other requirement in this phase either
   operationalizes a specific mitigation the threat model names, or is
   scoped by what the threat model identifies as in-scope for this
   phase versus a later one (per Section 4's Kubernetes/HSM/pentest
   deferrals).
3. Implement the secrets-management mechanism (REQ-10.9/10.10) and
   migrate the existing `.env`-sourced secrets to it for non-local-dev
   deployment, leaving local Compose usage unchanged.
4. Implement mTLS/authenticated service communication for the
   connections REQ-10.2/10.3 name, including the certificate/credential
   issuance and rotation story the ADR resolves.
5. Implement OIDC federation and session/token revocation in
   `AuthModule` (REQ-10.5/10.6), preserving existing local-account
   login.
6. Extend RBAC toward the concrete ABAC gaps (REQ-10.7) and implement
   the machine/service-identity mechanism (REQ-10.8), including the
   documented migration path for
   [[ADR-011-device-identity-and-sync-transport]]'s device token
   (REQ-10.4).
7. Enable encryption at rest for Postgres/MinIO and encryption in
   transit for the HTTP paths this phase brings under TLS
   (REQ-10.11/10.12).
8. Harden `audit_log` into a tamper-evident record (REQ-10.16).
9. Wire SBOM generation, vulnerability scanning, and image signing into
   `.github/workflows/ci.yml`'s `docker-build` job (REQ-10.13–10.15).
10. Document the retention/deletion policy and implement at least one
    enforced mechanism (REQ-10.17).
11. Write the tests REQ-10.18 requires.
12. Update [[Security_Baseline]] (retiring its "remains Phase 10" notes
    into "real as of Phase 10" ones, the same transition
    [[PRD-Phase-7]] made for PostGIS and [[PRD-Phase-8]]/[[PRD-Phase-9]]
    made for datasets/models/edge), update
    [[ADR-011-device-identity-and-sync-transport]]'s Review date entry
    to record what this phase actually did with its migration
    instruction, update [[Initial_Risk_Register]] with anything the
    threat model (REQ-10.1) surfaced, and update
    `docs/roadmap/Progress.md`.

## 7. ADRs required before/during Phase 10

- **Secrets-management tooling** — next ADR number `ADR-012`. Must
  settle what REQ-10.9/10.10's secrets-management mechanism actually is
  (e.g., a self-hosted secrets manager such as HashiCorp Vault or
  Infisical, a cloud KMS/secrets-manager integration, or a simpler
  encrypted-file-at-rest approach such as SOPS) — the "don't over-build
  for a reference implementation" reasoning
  [[ADR-011-device-identity-and-sync-transport]] used for Phase 9's
  device identity applies equally here; a full HSM/cloud-KMS build-out
  is not mandatory if a simpler mechanism satisfies the requirement (see
  Section 4's Non-goals).
- **OIDC provider and RBAC/ABAC mechanism** — next ADR number `ADR-013`.
  Must settle which OIDC provider `AuthModule` federates to (e.g., a
  self-hosted Keycloak/Ory instance versus a managed identity provider),
  the token-revocation mechanism for REQ-10.6, and whether REQ-10.7's
  ABAC extension is a handful of new attribute-based guard predicates
  layered onto the existing `RolesGuard` or genuinely needs a policy-
  engine dependency — per [[Guiding_Principles]]'s "Simplicity over
  Complexity," the simpler option should be the default unless the ADR
  finds a concrete reason it doesn't scale to REQ-10.7's named gaps.
- **Zero-trust / mTLS strategy for Compose** — next ADR number
  `ADR-014`. Must settle the mechanism behind REQ-10.2–10.4: a
  self-managed certificate authority and manually-issued certificates,
  a lightweight local tool (e.g., `mkcert`/`step-ca`) wired into
  Compose, or a minimal service-mesh sidecar — explicitly scoped to the
  current Docker Compose target (Section 4 defers a real
  Kubernetes/service-mesh rollout to Phase 12), but the ADR should note
  how its chosen mechanism is expected to carry forward or be replaced
  when Phase 12 happens.
- **Supply-chain tooling** — next ADR number `ADR-015`. Must settle the
  concrete tools behind REQ-10.13–10.15: an SBOM generator (e.g.,
  Syft), a vulnerability scanner (e.g., Grype or Trivy) and its
  merge-blocking severity threshold, and an artifact-signing mechanism
  (e.g., Sigstore/Cosign) plus where public keys or a transparency-log
  verification step live.

All four ADRs should use [[ADR-000-template]] and are written during
implementation, not as part of this PRD, per every prior phase's
precedent.

## 8. Success criteria / Definition of Done

- A threat model document exists, covers every container in
  [[Architecture_Overview]], and is cross-linked from
  [[Initial_Risk_Register]].
- At least the `api`↔`postgres`, `api`↔`minio`, and `api`↔`redpanda`
  connections are mutually authenticated and encrypted; no connection in
  this set is trusted by network location alone.
- `apps/api` can authenticate a user via an external OIDC provider
  without breaking existing local-account login; a revoked token or
  disabled account loses access before its original expiry.
- At least one concrete ABAC gap from [[PRD-Phase-2]]'s risk table
  (mission ownership scoping and/or a `viewer` role) is resolved.
- A machine/service-identity mechanism exists and is usable by Phase 8's
  training client instead of an operator JWT; a documented migration
  path exists for Phase 9's device bearer token onto this phase's
  identity/mTLS mechanism.
- Secrets for a non-local-dev deployment are sourced from the
  secrets-management mechanism ADR-012 selects, not `.env`; rotating one
  requires no code change.
- Postgres/MinIO data at rest, and the HTTP paths this phase brings
  under TLS, are encrypted in any deployment target beyond local
  development.
- `.github/workflows/ci.yml`'s `docker-build` job produces an SBOM per
  image, runs vulnerability scanning with a documented blocking policy,
  and signs built images, with a documented verification step.
- A tampered or deleted `audit_log` row is detectable, not merely
  prevented by application-layer convention.
- A retention/deletion policy is documented for every data category
  named in REQ-10.17, with at least one category enforced end-to-end.
- REQ-10.18's tests pass locally and in CI, or are written and
  gated/skippable with a documented reason if a live CI environment,
  real signing keys, or network access is unavailable in the environment
  they were authored in.
- `ADR-012`–`ADR-015` are accepted before their respective implementation
  steps are merged.
- No change in this phase widens `detection/classes.py`'s
  `ALLOWED_CLASSES` allow-list, relaxes the platform's safety boundary,
  or introduces a Kubernetes/service-mesh rollout, HSM/KMS integration,
  or pentest activity that Section 4 explicitly defers.

## 9. Dependencies

- Upstream: Phase 1's secrets baseline (REQ-1.18, no hardcoded secrets)
  and CI quality gates (REQ-1.19/1.20) that REQ-10.13–10.15 extend;
  Phase 2's `AuthModule`/`RolesGuard`/`AuditModule` (REQ-2.4–2.6,
  REQ-2.10) that REQ-10.5–10.8/10.16 harden rather than replace; Phase
  8's `training/registry_client.py` machine-identity gap and Phase 9's
  [[ADR-011-device-identity-and-sync-transport]] device bearer token,
  both of which this phase's REQ-10.4/10.8 directly resolve, per their
  own documented deferrals; [[Initial_Risk_Register]] and
  [[Quality_Attributes]]'s security-first priority order, which this
  phase's threat model (REQ-10.1) formalizes.
- This phase is the first to introduce a platform-wide secrets-
  management mechanism, an external OIDC dependency, and CI-level
  supply-chain tooling — sequence the ADRs in Section 7 before their
  respective implementation steps, per Section 6.
- Blocks: nothing in the MVP — Phase 10 is explicitly post-MVP
  ([[MVP_Implementation_Plan]]). Phase 11's observability work is a
  natural future consumer of this phase's structured security events
  (failed-auth attempts, revoked-token usage), not a dependency of it.
  Phase 12's Kubernetes/service-mesh rollout is a natural evolution of
  this phase's mTLS mechanism (ADR-014 explicitly notes this), not
  blocked on Phase 12 existing first. Phase 13's security test suites
  and Phase 14's compliance evidence both build on this phase's
  mechanisms without this phase needing either to exist first.

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| A formal threat model surfaces a mitigation this phase can't realistically complete (e.g., a finding that genuinely requires Kubernetes/service-mesh infrastructure) | REQ-10.1 is sequenced first specifically so scope gaps are found and explicitly deferred (Section 4) rather than discovered mid-implementation; Section 4's non-goals already name the most likely candidates |
| OIDC federation breaks existing local-account login for a reference implementation with no real identity provider available in this sandbox | REQ-10.5 explicitly requires both paths to coexist; ADR-013 should favor a self-hostable provider (e.g., Keycloak) that can run in Compose, keeping this phase testable without an external SaaS dependency |
| A general-purpose policy engine is adopted for RBAC/ABAC when a few new guard predicates would have sufficed, adding maintenance burden disproportionate to Phase 10's actual named gaps | ADR-013 explicitly weighs this against [[Guiding_Principles]]'s "Simplicity over Complexity"; REQ-10.7 is scoped to the concrete gaps already on record, not a speculative policy platform |
| mTLS/zero-trust work is built in a way that has to be thrown away when Phase 12 introduces Kubernetes/a service mesh | ADR-014 explicitly scopes itself to Compose but records how its mechanism is expected to carry forward, per Section 7/9 |
| Secrets-management tooling is over-built (a full HSM/KMS) for a reference implementation with no real production deployment target yet | Section 4 explicitly allows a simpler mechanism as an acceptable DoD outcome if ADR-012 reasons through why a full HSM/KMS is premature, mirroring [[ADR-011-device-identity-and-sync-transport]]'s precedent for Phase 9 |
| SBOM/vulnerability-scanning/signing steps are written but can't be verified end-to-end in this sandbox (no network egress for some toolchains, same recurring limitation as every prior phase) | REQ-10.18 explicitly allows a documented, gated Known-gap outcome, the same pattern every prior phase's Known gaps have used |
| Hardening the audit trail or adding mTLS/OIDC breaks an existing Phase 2–9 integration test or e2e flow that assumes today's simpler, unauthenticated-by-network-trust posture | REQ-10.18's tests are written to cover both the new mitigations and a regression check against the existing critical paths named in [[PRD-Phase-2]]/[[PRD-Phase-6]]'s e2e coverage |
| Scope creep into Kubernetes/service-mesh rollout, HSM/KMS integration, real penetration testing, or compliance certification | Explicit non-goals (Section 4); those remain Phase 12/13/14's, or genuinely out of this platform's reference-implementation scope |

(See also [[Initial_Risk_Register]] for platform-wide risks this phase's
threat model, REQ-10.1, is expected to extend.)

## 11. Open questions

- **Secrets-management tooling** (Section 7's `ADR-012`): a self-hosted
  secrets manager, a cloud KMS/secrets-manager integration, or a
  simpler encrypted-file approach — resolve against this platform's
  reference-implementation scope, not an assumed production deployment
  target.
- **OIDC provider and RBAC/ABAC mechanism** (Section 7's `ADR-013`):
  which provider, and whether REQ-10.7's ABAC extension needs a real
  policy-engine dependency or a handful of new guard predicates.
- **Zero-trust/mTLS strategy** (Section 7's `ADR-014`): certificate
  authority and issuance approach for Compose, and how far REQ-10.2's
  "every connection this phase's threat model identifies as in-scope"
  actually extends — the threat model (REQ-10.1) should answer this
  concretely rather than this PRD guessing at the full connection list
  in advance.
- **Supply-chain tooling** (Section 7's `ADR-015`): SBOM generator,
  vulnerability scanner and its blocking-severity threshold, and
  signing mechanism.
- Whether model-artifact signing (Phase 8's model registry) should be
  pulled into this phase's REQ-10.15 scope now, or left as a documented
  future extension once container-image signing is proven out — this
  PRD does not mandate it, per Section 5.6's note, but flags it as a
  natural next step for whichever phase or follow-up revisits supply-
  chain controls.
- Whether `apps/vision-service`↔`redpanda` and `apps/outbox-
  publisher`↔`postgres` need the same mTLS treatment as the `api`-
  fronted connections REQ-10.3 names explicitly, or whether the threat
  model (REQ-10.1) finds a narrower in-scope set sufficient for this
  phase — resolve during Section 6 step 2, not assumed here.
- What "at least one concrete mechanism" means for REQ-10.17's
  retention/deletion policy in practice — a scheduled cleanup job, a
  manual documented runbook, or a soft-delete/archive convention —
  resolve during Section 6 step 10, informed by whichever data category
  the threat model or a stakeholder flags as highest-priority first
  (mission video and telemetry are the largest-volume candidates; audit
  records are the most retention-sensitive one, per REQ-10.16's
  immutability work).
- Whether this phase's OIDC work should also resolve
  [[PRD-Phase-6]]'s open question on JWT storage (`sessionStorage` vs.
  in-memory) given that ADR-013's chosen mechanism may change the token
  shape — flagged there already as "revisit if Phase 10's OIDC work
  changes the token shape," not decided here.

---

## Relationship to other documents

- Derived directly from the roadmap's "Phase 10 — Security Architecture"
  entry in [[AI_Defense_Platform_Roadmap]]. Like [[PRD-Phase-8]] and
  [[PRD-Phase-9]], this PRD is **not** an MVP-slice reduction —
  [[MVP_Implementation_Plan]] defers all of Phase 10 past the MVP (save
  for the baseline subset already shipped in Phases 1–3), so this PRD
  covers the roadmap's full stated deliverables.
- Structure mirrors [[PRD-Phase-1]] through [[PRD-Phase-9]].
- Turns every "remains Phase 10" / "deferred to Phase 10" note already
  on record in [[Security_Baseline]], [[PRD-Phase-2]], [[PRD-Phase-6]],
  [[PRD-Phase-9]], and [[ADR-011-device-identity-and-sync-transport]]
  into implementable requirements — the same "aspirational until a
  phase makes it real" transition [[PRD-Phase-7]] made for PostGIS,
  [[PRD-Phase-8]] made for datasets/models, and [[PRD-Phase-9]] made for
  the edge runtime — this phase makes it real for the platform's
  security posture.
- Deliberately does not resolve the four architectural questions named
  in Section 7/11 (secrets tooling, OIDC/RBAC-ABAC mechanism, mTLS
  strategy, supply-chain tooling) itself — those are ADR-level decisions
  to be made with full context during implementation, not guessed at
  here, per this project's standing instruction not to assume answers
  that aren't in the knowledge base.

---

## Related Notes

- [[AI_Defense_Platform_Roadmap]]
- [[MVP_Implementation_Plan]]
- [[PRD-Phase-1]]
- [[PRD-Phase-2]]
- [[PRD-Phase-6]]
- [[PRD-Phase-8]]
- [[PRD-Phase-9]]
- [[ADR-011-device-identity-and-sync-transport]]
- [[Security_Baseline]]
- [[Quality_Attributes]]
- [[Initial_Risk_Register]]
- [[Guiding_Principles]]
- [[Goals]]
- [[Architecture_Overview]]
- [[Coding_Standards]]
- [[Repository_Structure]]
- [[ADR-000-template]]
