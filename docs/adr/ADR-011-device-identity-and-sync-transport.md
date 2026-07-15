---
title: "ADR-011: Device Identity and Synchronization Transport"
type: adr
tags: [adr, phase9, edge, security]
status: accepted
---

# ADR-011: Device Identity and Synchronization Transport

- Status: Accepted
- Date: 2026-07-15
- Decision owners: Dmytro
- Related documents: [[PRD-Phase-9]], [[ADR-010-edge-runtime-language-and-inference-strategy]], [[Security_Baseline]], [[Quality_Attributes]], [[PRD-Phase-8]], [[Initial_Risk_Register]]

## Context

`docs/mvp-plan/PRD-Phase-9.md` Section 7 requires this ADR to settle two
things before REQ-9.9/9.10 (device identity) and the synchronization
path (REQ-9.6/9.7) are implemented: what credential an edge device
authenticates with, and what transport carries synchronized events back
to the central platform. Today, every authenticated client of
`apps/api` is a human operator with a JWT obtained by password login
([[Security_Baseline]]); nothing represents an unattended device
identity. [[PRD-Phase-8]]'s `training/registry_client.py` comes closest
to a "service" credential — it authenticates with
`VISION_SERVICE_MODEL_REGISTRY_API_TOKEN`, but that token **is** an
operator's own JWT, obtained from the login endpoint and configured for
the training job to reuse. [[Progress]]'s Phase 8 Known gaps already
flags this explicitly as a deferred gap: "this reference implementation
deliberately defers a real machine-identity/service-account mechanism to
Phase 10." Phase 9 cannot defer identity the same way — REQ-9.9
specifically requires a credential distinct from, and narrower than, an
operator account, because an edge device is physically exposed in a way
a browser session is not.

## Decision

**Device identity**: a pre-provisioned, per-device bearer token,
issued by a new admin-only `POST /devices` endpoint
(`apps/api/src/edge/edge-devices.controller.ts`). The endpoint generates
a random 256-bit token (`crypto.randomBytes(32).toString("hex")`),
returns it **exactly once** in the registration response, and stores
only its SHA-256 hash (`edge_devices.token_hash`) — the same
"never store the credential itself" posture bcrypt already gives
password hashes, but using a fast hash rather than bcrypt because a
device token is high-entropy (256 bits) and needs no
slow-hashing/rainbow-table defense the way a human-chosen password
does; the fast hash keeps sync-request latency low for a device that
may sync frequently. A `DeviceAuthGuard` (`apps/api/src/edge-auth/`)
verifies the `Authorization: Bearer <token>` header on every
device-facing request by hashing the presented token and looking it up
against `edge_devices.token_hash`, rejecting revoked
(`revoked_at IS NOT NULL`) devices. This is deliberately the simplest
mechanism that satisfies REQ-9.9's "narrower than an operator account"
requirement: a device token grants access only to the specific
device-facing endpoints below, never to any `operator`/`admin`-gated
mission, dataset, or model-management route.

**Synchronization transport**: a new HTTP endpoint,
`POST /edge/events`, guarded by `DeviceAuthGuard` only (no JWT
alternative — this route exists for devices, not browsers). The edge
agent POSTs a batch of buffered events; `EdgeEventsService` persists
each idempotently (REQ-9.7, reusing REQ-3.8/8's `processed_events`
pattern keyed on `(eventId, 'api-edge-events')`) and writes a row to the
existing generic `outbox` table in the same transaction — reusing
`apps/outbox-publisher`'s already-running poll/publish loop rather than
adding a second publishing path. This keeps the Kafka broker itself
inside the existing trusted Compose network boundary: a device never
holds a Kafka client connection or broker address, only an HTTPS
endpoint and a bearer token — the same trust boundary every browser
client already operates under, not a new, weaker one carved out for
devices.

**Model resolution/download reuses this same device credential.**
`GET /models/production` and `GET /storage/download-url` are extended
to accept `DeviceAuthGuard` as an alternative to `JwtAuthGuard` (a new
composite `JwtOrDeviceAuthGuard`), so the edge agent can resolve and
download its production model (REQ-9.13/9.15) with only its device
token — no operator JWT is provisioned to a device, unlike Phase 8's
training-job shortcut. A device is never given direct MinIO
credentials: it always goes through `apps/api`'s existing signed-URL
issuance, the same indirection every browser upload/download already
uses.

## Alternatives considered

### Alternative A — pre-provisioned bearer token + HTTP ingestion endpoint (as decided)

Chosen: reuses existing infrastructure end-to-end (the `outbox` table,
`apps/outbox-publisher`, `processed_events`, signed-URL issuance) with
one new guard and one new table. Narrower than an operator JWT by
construction (only device-facing routes accept it). Verifiable without
any new infrastructure dependency.

### Alternative B — reuse Phase 8's pattern: provision an operator JWT to each device

Rejected: this is the exact gap [[Progress]]'s Phase 8 Known gaps
already flags as deliberately deferred, not a pattern to extend
further. An operator JWT grants every `operator`-gated route (mission
mutation, dataset registration, etc.) — a stolen or physically extracted
device credential under this alternative would grant far more than
REQ-9.9 intends. Explicitly rejected here rather than carried forward
silently.

### Alternative C — direct Kafka producer connection from the edge device

Would let a device publish straight to `aidefense.device-events`
without an HTTP round-trip through `apps/api`. Rejected: requires
exposing the Kafka broker's address/credentials beyond the currently
trusted Compose network to a physically exposed, intermittently
connected device — a materially different and weaker trust boundary
than every other client this platform has. [[Quality_Attributes]]
places security/auditability as the first-priority quality attribute;
an HTTP endpoint behind a narrow device credential, with the broker
never exposed to devices at all, is the more conservative choice, and
also gives idempotent ingestion (REQ-9.7) a natural home in the same
Postgres transaction as every other mutating endpoint in this platform,
rather than needing a new consumer-side idempotency mechanism specific
to device-originated Kafka messages.

### Alternative D — full mTLS / per-device X.509 certificates now

Would be the strongest device-identity mechanism and the one Phase 10
("Security Architecture") is explicitly scoped to deliver
platform-wide. Rejected for Phase 9 specifically as premature: this
platform has no certificate authority, no certificate lifecycle
tooling, and no mTLS termination anywhere yet — building one custom,
edge-only PKI ahead of Phase 10's platform-wide zero-trust work would
create a second, divergent security mechanism to reconcile later, the
same "don't build it twice" reasoning
[[ADR-010-edge-runtime-language-and-inference-strategy]] used to reject
a duplicated detection implementation. The minimal bearer-token
mechanism (Decision above) is deliberately a stepping stone, not a
final answer — flagged as a candidate for Phase 10 hardening, not
presented as equivalent to mTLS.

## Consequences

### Positive

- No new infrastructure dependency: the `outbox` table,
  `outbox-publisher`, `processed_events`, and signed-URL issuance are
  all reused unmodified.
- A device credential is provably narrower than an operator account —
  it cannot reach any `operator`/`admin`-gated route.
- `aidefense.device-events` finally gets a real producer
  (REQ-9.11), closing the gap [[Progress]]'s Phase 3 Known gaps left
  open ("no producer or consumer — intentionally deferred").

### Negative

- A device bearer token, once issued, is a long-lived static secret
  (no rotation mechanism in this phase) — acceptable for a reference
  implementation's Phase 9 scope, but a real deployment should rotate
  it periodically; not built here (see Non-goals in [[PRD-Phase-9]]).
- `DeviceAuthGuard`'s hash-and-lookup happens on every synchronized
  batch; at very high device-fleet scale this is an extra indexed query
  per request — acceptable at this phase's reference-architecture
  scale, revisit only if a real fleet-size deployment shows it matters.
- Token compromise grants full device-facing access (ingest events as
  that device, resolve/download the production model) until the token
  is explicitly revoked via `POST /devices/:id/revoke` — there is no
  automatic anomaly detection.

### Risks

- Devices are provisioned manually (an admin runs `POST /devices` and
  distributes the returned token out-of-band) — no automated
  fleet-enrollment flow exists yet; acceptable for a reference
  implementation, a real fleet-management concern for later.

## Migration and rollback

No migration — `edge_devices`, `POST /devices`, and `POST /edge/events`
are all new. Rollback is simply not registering any devices; every
route this ADR touches (`GET /models/production`,
`GET /storage/download-url`) still accepts the existing `JwtAuthGuard`
path unchanged, so no existing operator-facing behavior is altered.

## Review date

Revisit when Phase 10 ("Security Architecture") designs platform-wide
mTLS/OIDC device identity — this ADR's bearer-token mechanism should be
migrated to, or wrapped by, that mechanism rather than maintained as a
permanent parallel system.

---

## Related Notes

- [[PRD-Phase-9]] — the requirements this ADR resolves Section 7 for.
- [[ADR-010-edge-runtime-language-and-inference-strategy]] — the sidecar/model-path design this device credential's model download feeds.
- [[Security_Baseline]] — the existing JWT/RBAC baseline this device credential sits alongside, not inside.
- [[Quality_Attributes]] — security/auditability priority behind rejecting Alternative C.
- [[PRD-Phase-8]] — the model registry/signed-URL infrastructure this ADR's device credential reuses.
- [[Initial_Risk_Register]] — edge-connectivity and scope risks this decision weighs.
