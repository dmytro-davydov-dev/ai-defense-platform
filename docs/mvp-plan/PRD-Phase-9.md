---
title: "PRD — Phase 9: Edge Runtime"
type: prd
tags: [prd, phase9, edge]
status: draft
---

# PRD — Phase 9: Edge Runtime

Version: 1.0
Status: Draft
Date: 2026-07-15
Owner: Dmytro
Related documents: [[AI_Defense_Platform_Roadmap]], [[MVP_Implementation_Plan]], [[PRD-Phase-1]], [[PRD-Phase-3]], [[PRD-Phase-5]], [[PRD-Phase-8]], [[ADR-006-detection-model-and-tracker]], [[Detection_And_Tracking]], [[Technology_Decisions]], [[Architecture_Overview]], [[Repository_Structure]], [[Security_Baseline]], [[Coding_Standards]], [[Quality_Attributes]], [[Initial_Risk_Register]], [[Guiding_Principles]], [[Goals]]

---

## 1. Summary

Phase 9 is the roadmap's "Edge Runtime" phase — like Phase 8, entirely
**outside MVP scope** ([[MVP_Implementation_Plan]] explicitly lists
"Phase 9 (edge runtime / Jetson deployment)" under "Explicitly deferred
past MVP"). It implements `apps/edge-agent`, currently an empty
Phase 1 stub (REQ-1.7: "empty stub scaffold (implemented in Phase 9)"),
into a real agent that runs near an approved sensor, performs local
inference when cloud connectivity is constrained or absent, buffers
results safely offline, and synchronizes them back to the central
platform once connectivity returns — without ever becoming, or enabling,
an autonomous engagement system.

This PRD is scoped against the roadmap's full "Phase 9 — Edge Runtime"
entry directly, the same way [[PRD-Phase-8]] was scoped against the
roadmap's full Phase 8 entry rather than an MVP slice.

## 2. Problem statement

`apps/edge-agent/src/main.ts` today is a one-line no-op: `log("info",
"edge-agent stub — no-op until Phase 9")`. Every other capability this
phase needs is either unbuilt or exists only for the cloud path:

- [[Detection_And_Tracking]]'s detect→filter→track→annotate→publish
  pipeline (Phase 5) and [[PRD-Phase-8]]'s model registry/promotion
  (Phase 8) both assume a connected environment with a reachable
  Postgres, MinIO, and Kafka broker. Nothing in the platform today runs
  inference, buffers results, or resolves a model version when any of
  those are unreachable.
- [[Initial_Risk_Register]] names "Edge connectivity is unreliable"
  (High probability, Medium impact) with the stated mitigation "Local
  buffer and store-and-forward" — not yet implemented anywhere.
- The roadmap's Phase 3 topic taxonomy already declares
  `aidefense.device-events`, but [[Progress]]'s Phase 3 Known gaps
  record it as created with "no producer or consumer — intentionally
  deferred." This phase is where that topic becomes real.
- **A real architectural tension exists that no prior document
  resolves**: `apps/edge-agent` was scaffolded in Phase 1 as a
  TypeScript/Node package (importing `@ai-defense/observability`, the
  same package `apps/api` and `apps/outbox-publisher` use), but
  [[ADR-006-detection-model-and-tracker]]'s entire detector adapter
  contract (`DetectorAdapterLike`, `OnnxDetectorAdapter`, `filters.py`'s
  `ALLOWED_CLASSES` enforcement, `tracker.py`) is Python, living in
  `apps/vision-service`. Nothing in [[Technology_Decisions]],
  [[Architecture_Overview]], or the roadmap states whether the edge
  agent is meant to reimplement detection in Node (via an ONNX Runtime
  Node binding) or to run/embed the existing Python pipeline unchanged.
  This PRD does not guess at that answer — it is flagged as a required
  ADR in Section 7 and left as an explicit open question in Section 11,
  per this project's standing instruction not to assume answers that
  aren't in the knowledge base.
- No device-facing ingestion path exists. `apps/api`'s current REST
  surface (missions, storage, datasets, training-runs, model-registry —
  see [[API_Shell]]) is built for browser/operator clients authenticated
  via [[Security_Baseline]]'s user-account JWTs; nothing accepts
  synchronized events from an unattended, intermittently-connected
  device identity.

## 3. Goals

- A real `apps/edge-agent` process that: connects to an approved video
  source, runs local object detection/tracking against the same safety
  boundary Phase 5 already enforces (`ALLOWED_CLASSES`, no
  weapon/targeting classes), buffers its output locally when the
  central platform is unreachable, and synchronizes buffered output
  once connectivity returns.
- Reuse, not reimplement, the Phase 5/8 safety boundary and detector
  contract: whatever the ADR in Section 7 decides, the edge runtime
  must apply the exact same `ALLOWED_CLASSES` allow-list
  ([[ADR-006-detection-model-and-tracker]]) as the cloud path — this
  phase must not create a second, divergent place where that boundary
  could drift.
- A local, durable event buffer (SQLite, per the roadmap) that survives
  process restarts and network partitions without losing or duplicating
  recorded detections/health events — the edge-side analog of
  Phase 3's Transactional Outbox.
- A store-and-forward synchronization mechanism that safely delivers
  buffered events to the central platform exactly once (idempotent, per
  the same principle REQ-3.8 already established for Kafka consumers),
  resuming cleanly after an arbitrarily long offline period.
- A minimal secure device identity: each edge agent authenticates to the
  central platform as itself (not as an operator's user account),
  scoped narrowly enough that a compromised or stolen device cannot act
  as an arbitrary API client — a deliberately lightweight mechanism
  (see Section 11), with full PKI/mTLS device identity remaining
  Phase 10's concern, the same "baseline now, hardening later" split
  [[Security_Baseline]] already uses for JWT vs. OIDC.
- Device health reporting: liveness, resource state (CPU/memory/disk if
  cheaply available), buffer depth, and last-successful-sync timestamp,
  observable centrally — finally giving `aidefense.device-events` a real
  producer, closing the Phase 3 gap named in Section 2.
- Remote model deployment and rollback for the edge, built on
  [[PRD-Phase-8]]'s existing model registry (`GET /models/production`,
  `POST /models/:id/promote`, `POST /models/rollback`) rather than a new
  parallel mechanism — the edge agent resolves and downloads its active
  model the same way `detection/factory.py`'s registry-resolution path
  already does for the cloud vision-service (REQ-8.10).
- Bandwidth-aware upload: synchronization does not assume a fast, always
  reliable link — it must be able to defer, batch, or prioritize what it
  sends (e.g., detection metadata before full video segments) when
  bandwidth is scarce.
- Vendor-specific acceleration (TensorRT on NVIDIA Jetson) stays fully
  optional and isolated behind an adapter, per
  [[Quality_Attributes]]'s Portability section ("vendor-specific
  acceleration isolated behind adapters") and
  [[Initial_Risk_Register]]'s "GPU-specific optimization reduces
  portability" mitigation ("ONNX baseline and adapter pattern") — ONNX
  Runtime CPU execution must remain a working fallback with no Jetson
  hardware present, the same "runs anywhere, accelerate optionally"
  posture [[ADR-006-detection-model-and-tracker]] already established
  for the cloud path.

## 4. Non-goals (explicitly out of scope for Phase 9)

- Full mTLS / PKI-based device identity and certificate lifecycle
  management — Phase 10 ("Security Architecture") owns zero-trust
  service communication and mTLS; this phase ships the minimal device
  credential described in Section 11, not the full hardened mechanism.
- Kubernetes-orchestrated or fleet-managed edge deployment — Phase 12
  ("Kubernetes and Delivery Platform") owns orchestration at scale; this
  phase targets a single edge device running under Docker.
- Any expansion of `detection/classes.py`'s `ALLOWED_CLASSES` allow-list,
  or any edge-side detection/tracking logic that diverges from the
  cloud path's safety filtering — the platform-wide safety boundary
  (`README.md`, [[Guiding_Principles]]) applies identically at the edge.
- Autonomous target selection, weapon control, strike optimization, or
  any autonomous engagement logic — [[Goals]]'s "Explicitly Out of
  Scope" list and the roadmap's own Phase 9 constraint ("remains an
  analytical sensor-processing node and does not control weapons or
  autonomous engagement systems") apply without exception.
- Live, continuous video streaming from the edge to the cloud as the
  primary data path — the store-and-forward model (buffered events,
  batched/prioritized upload) is the design center; a live low-latency
  stream is a different, unaddressed problem.
- Training or fine-tuning a model at the edge — Phase 8 owns training;
  the edge only ever consumes a model the registry already promoted.
- Real NVIDIA Jetson hardware validation — this platform's every prior
  phase has documented sandbox limitations (no docker daemon, no
  network egress for toolchain downloads); this phase's Known gaps will
  almost certainly include "not run on real Jetson hardware," the same
  category of gap as Phase 5's "no real `.onnx` model has been run."
  TensorRT-specific behavior in particular cannot be verified without
  real NVIDIA hardware and drivers.
- A new observability dashard/alerting surface for device health —
  device-health *events* are this phase's job (REQ-9.x below); turning
  them into dashboards/alerts is Phase 11's ("Observability and
  Operations").

## 5. Requirements

### 5.1 Edge agent runtime and video capture

- REQ-9.1: `apps/edge-agent` becomes a real, runnable process (not a
  no-op stub) that starts, exposes `/health`/`/ready` following the
  same convention every other service shell established in Phase 1
  (REQ-1.8), and can be stopped/restarted cleanly.
- REQ-9.2: A video capture adapter reads from an approved local video
  source (a file, an attached camera device, or an RTSP/local stream —
  resolved in Section 11) and produces frames in the same normalized
  shape Phase 4's `Frame`/`Detection` contracts already use, so the
  detection stage (REQ-9.3) does not need a second frame representation.

### 5.2 Local inference

- REQ-9.3: The edge agent runs object detection/tracking against
  captured frames using the exact same detector-adapter contract and
  `ALLOWED_CLASSES` enforcement [[ADR-006-detection-model-and-tracker]]
  already defines — the concrete implementation strategy (embed the
  existing Python pipeline vs. a Node-native ONNX Runtime path) is
  resolved by the ADR required in Section 7, but whichever is chosen,
  no second, independently-maintained copy of the safety filter is
  created.
- REQ-9.4: ONNX Runtime CPU execution is a mandatory, always-available
  fallback; TensorRT (or any other NVIDIA-specific acceleration) is
  strictly optional and selected behind an adapter, never a hard
  dependency of REQ-9.3.

### 5.3 Offline buffering and store-and-forward synchronization

- REQ-9.5: A local, durable event buffer (SQLite) persists every
  detection/health event the edge agent produces, surviving process
  restarts, so no result is lost solely because the central platform
  was unreachable at the moment it was produced.
- REQ-9.6: A synchronization client uploads buffered events to the
  central platform once connectivity is available, marking each event
  synced only after a confirmed successful delivery — the edge-side
  mirror of Phase 3's outbox-publisher's "poll unpublished rows, mark
  published on success" pattern.
- REQ-9.7: Synchronization is idempotent on the receiving side: a
  redelivered (already-synced) event produces no duplicate record or
  side effect on the central platform, reusing REQ-3.8's
  `processed_events`-style idempotency pattern rather than inventing a
  new one.
- REQ-9.8: An arbitrarily long offline period (hours to days) does not
  corrupt or unbounded-ly grow the local buffer in a way that crashes
  the agent — a bounded-storage/backpressure policy is defined (exact
  policy resolved in Section 11).

### 5.4 Device identity and secure sync

- REQ-9.9: Each edge agent authenticates to the central platform with a
  device-scoped credential distinct from an operator's user-account JWT
  — the minimal mechanism is resolved in Section 11, but it must be
  narrow enough that possession of one device's credential does not
  grant access equivalent to an `admin`/`operator` user account.
- REQ-9.10: Every event a device synchronizes carries that device's
  identity, so a synced detection/health event's origin is
  attributable, the same accountability property [[Security_Baseline]]
  already requires of every other mutating action via `audit_log`.

### 5.5 Health reporting and observability

- REQ-9.11: The edge agent reports device health (liveness, buffer
  depth, last-successful-sync timestamp, and any cheaply available
  resource metrics) as structured events, published to
  `aidefense.device-events` — the topic the roadmap declared in Phase 3
  and left unpopulated (per [[Progress]]'s Phase 3 Known gaps).
- REQ-9.12: Health/device events propagate the same correlation-ID
  discipline REQ-3.11 established, so an edge event can be traced
  end-to-end alongside cloud-produced events for the same mission or
  device, per [[Quality_Attributes]]'s Observability section.

### 5.6 Remote model deployment and rollback

- REQ-9.13: The edge agent resolves its active detection model from
  [[PRD-Phase-8]]'s existing model registry (`GET /models/production`),
  the same registry-resolution path `detection/factory.py` already
  implements for the cloud vision-service (REQ-8.10) — not a new,
  edge-specific model registry.
- REQ-9.14: A newly promoted production model is deployable to the edge
  without a code change to the edge agent, and rollback (REQ-8.11's
  existing mechanism) is reachable from the edge the same way — the
  edge-side analog of REQ-8.10/8.11's no-code-change property.
- REQ-9.15: Model download to the edge is bandwidth-aware: it does not
  assume an unconstrained link, and can be deferred/retried rather than
  blocking detection with the last-known-good model in the meantime.

### 5.7 Bandwidth-aware upload

- REQ-9.16: When bandwidth is constrained, the synchronization client
  prioritizes smaller, higher-value payloads (e.g., detection metadata
  and health events) over larger ones (e.g., annotated video segments,
  if the edge produces them), rather than uploading everything in
  arrival order regardless of size or importance.

### 5.8 Testing

- REQ-9.17: Unit tests cover the local buffer's durability (write,
  restart, no loss), the synchronization client's idempotency (a
  redelivered event produces no duplicate), and the bandwidth-aware
  prioritization logic in isolation from any real network or hardware.
- REQ-9.18: An integration/fixture-based test exercises the full
  offline→buffer→reconnect→sync flow against a fixture video and a
  simulated connectivity interruption, without requiring real edge
  hardware.

## 6. Technical approach (ordered task list)

1. Resolve the ADRs required before implementation (Section 7): edge
   runtime language/inference strategy, and device identity/sync
   transport.
2. Replace `apps/edge-agent/src/main.ts`'s no-op stub with the real
   process shell: `/health`/`/ready`, configuration loading, structured
   logging via the existing `@ai-defense/observability` package
   (REQ-9.1).
3. Implement the video capture adapter (REQ-9.2), producing frames in
   the same shape Phase 4's `Frame` contract already defines.
4. Implement local inference per the ADR's chosen strategy (REQ-9.3/9.4)
   — either invoking the existing Python detection pipeline unchanged,
   or a new Node-native adapter implementing the same
   `DetectorAdapterLike`-equivalent contract and reusing
   `ALLOWED_CLASSES` from a shared source rather than a hand-copied
   duplicate.
5. Implement the SQLite-backed local event buffer (REQ-9.5) and the
   synchronization client (REQ-9.6/9.7/9.8), including the bounded-
   storage/backpressure policy.
6. Implement device identity issuance/verification and wire it into the
   synchronization client and a new device-facing ingestion endpoint in
   `apps/api` (REQ-9.9/9.10) — the first API surface this platform
   exposes to an unattended device rather than an operator's browser.
7. Implement device health reporting to `aidefense.device-events`
   (REQ-9.11/9.12), including a consumer in `apps/api` (or a documented
   reason one isn't needed yet, mirroring Phase 3's "declared topic,
   deferred consumer" pattern if this phase intentionally leaves the
   read side for later).
8. Wire the edge agent's model resolution to the existing model registry
   (REQ-9.13/9.14/9.15), with no new registry endpoints beyond what
   Phase 8 already built unless the ADR in Section 7 finds a genuine
   gap.
9. Implement bandwidth-aware upload prioritization (REQ-9.16).
10. Write unit and integration/fixture tests (REQ-9.17/9.18).
11. Update [[Architecture_Overview]]'s Edge Runtime section (currently a
    bullet list of responsibilities with no implementation behind it —
    the same "aspirational until a phase makes it real" transition
    [[PRD-Phase-7]] made for PostGIS and [[PRD-Phase-8]] made for
    datasets/models), create the first note under `docs/edge/` (empty
    per [[MOC]] today), and update `docs/roadmap/Progress.md`.

## 7. ADRs required before/during Phase 9

- **Edge runtime language and inference strategy** — next ADR number
  `ADR-010`. Must settle whether `apps/edge-agent` (currently a
  TypeScript/Node scaffold from Phase 1) reimplements detection via a
  Node-native ONNX Runtime binding, or embeds/shells out to the existing
  Python detection pipeline (`apps/vision-service`'s
  `OnnxDetectorAdapter`/`filters.py`/`tracker.py`) as a subprocess or
  sidecar — and, either way, exactly how `ALLOWED_CLASSES` is shared
  rather than duplicated. This must be resolved before Section 6 step 4
  (local inference) is implemented. This is a materially harder decision
  than most prior-phase ADRs because it affects whether Phase 9 is
  "extend an existing Node stub" or "add a Python runtime to an edge
  device," with real consequences for Jetson deployment size, TensorRT
  binding availability (native to Python/C++ toolchains, not Node), and
  maintenance burden.
- **Device identity and synchronization transport** — next ADR number
  `ADR-011`. Must settle the minimal device-credential mechanism
  (REQ-9.9) — e.g., a pre-provisioned bearer token analogous to
  `training/registry_client.py`'s `VISION_SERVICE_MODEL_REGISTRY_API_TOKEN`
  pattern, versus a per-device API key issued through a new admin-only
  endpoint — and whether synchronized events reach the central platform
  via a new HTTP ingestion endpoint in `apps/api` (consistent with
  [[Security_Baseline]]'s existing all-HTTP surface) or a direct Kafka
  producer connection from the edge device (which would require exposing
  the broker beyond the current trusted Compose network, a materially
  different security posture). Must be resolved before Section 6 step 6.

Both ADRs should use [[ADR-000-template]] and are written during
implementation, not as part of this PRD.

## 8. Success criteria / Definition of Done

- `apps/edge-agent` runs as a real process (not the Phase 1 stub),
  captures frames from an approved local video source, and produces
  detections/tracks through the same safety-filtered pipeline the cloud
  path uses — enforcing the identical `ALLOWED_CLASSES` boundary.
- Detections and health events produced while disconnected are held in
  a durable local buffer and are not lost across a process restart.
- Once connectivity returns, buffered events synchronize to the central
  platform exactly once — a simulated redelivery produces no duplicate.
- The edge agent authenticates as a device, not as an operator, and
  every synced event is attributable to a specific device identity.
- Device health (liveness, buffer depth, last-sync time) is observable
  centrally via `aidefense.device-events`, the first real use of that
  topic.
- A model promoted through Phase 8's existing registry is resolvable
  and deployable to the edge agent without a code change, and rollback
  works the same way.
- Upload prioritizes smaller/higher-value payloads under constrained
  bandwidth rather than uploading in naive arrival order.
- Unit tests (REQ-9.17) and the offline/reconnect fixture test
  (REQ-9.18) pass locally and in CI, or are written and
  gated/skippable with a documented reason if real hardware, a live
  Compose stack, or network access is unavailable in the environment
  they were authored in — the same pattern every prior phase's Known
  gaps have used.
- `ADR-010` (edge runtime language/inference strategy) and `ADR-011`
  (device identity/sync transport) are accepted before their respective
  implementation steps are merged.
- No change in this phase widens `detection/classes.py`'s
  `ALLOWED_CLASSES` allow-list, introduces autonomous engagement logic,
  or otherwise creates a path around the platform-wide safety boundary.

## 9. Dependencies

- Upstream: Phase 1's `apps/edge-agent` stub scaffold (REQ-1.7) and
  Phase 3's declared-but-unpopulated `aidefense.device-events` topic
  (REQ-3.1); Phase 5's detector-adapter contract and safety boundary
  ([[ADR-006-detection-model-and-tracker]], `ALLOWED_CLASSES`), which
  this phase must reuse rather than re-derive; Phase 8's model registry
  and promotion/rollback endpoints (REQ-8.9–8.11), which this phase's
  remote model deployment builds directly on top of, per Phase 8's own
  Section 9 note that its registry is "a candidate input to Phase 9's
  edge model deployment/rollback, though Phase 9 is not blocked on this
  phase's specific implementation choices." Phase 2's audit/RBAC
  patterns, reused for the new device-facing ingestion endpoint's
  attribution requirement (REQ-9.10).
- This phase is the first to introduce a device identity concept
  distinct from a user account, and the first new API surface intended
  for an unattended client rather than a browser or another platform
  service — sequence `ADR-011` before adding the new ingestion endpoint
  to `apps/api`.
- Blocks: nothing in the MVP — Phase 9 is explicitly post-MVP
  ([[MVP_Implementation_Plan]]). Phase 10's full mTLS/PKI device
  identity work is a natural hardening of this phase's minimal
  credential (REQ-9.9), not a blocker for it. Phase 11's dashboards are
  a natural consumer of this phase's `aidefense.device-events` stream,
  not a dependency of it.

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| Edge connectivity is unreliable, causing lost detections/health data if there's no local buffer | REQ-9.5–9.8's durable SQLite buffer and idempotent store-and-forward sync, directly operationalizing [[Initial_Risk_Register]]'s named "Edge connectivity is unreliable" risk |
| GPU/vendor-specific (TensorRT/Jetson) optimization reduces portability, making the edge agent unable to run without specific hardware | REQ-9.4 keeps ONNX Runtime CPU execution mandatory and TensorRT strictly optional behind an adapter, per [[Initial_Risk_Register]]'s "GPU-specific optimization reduces portability" mitigation |
| The edge runtime silently diverges from the cloud path's safety filtering (a second, independently-maintained `ALLOWED_CLASSES`-equivalent drifts out of sync) | REQ-9.3 requires the exact same enforcement mechanism; `ADR-010` explicitly addresses how the allow-list is shared, not duplicated |
| A device credential is compromised or a device is physically stolen, and the minimal Phase 9 identity mechanism grants more access than intended | REQ-9.9 scopes the device credential narrowly (sync/ingestion only, not equivalent to an operator/admin account); full mTLS/PKI hardening is Phase 10's explicit follow-up, not silently deferred without acknowledgment |
| An unbounded local buffer during a very long offline period exhausts device storage and crashes the agent | REQ-9.8 requires a defined bounded-storage/backpressure policy as part of the buffer design, not an afterthought |
| Scope creep into full mTLS device identity, Kubernetes-orchestrated edge fleets, live video streaming, or edge-side training | Explicit non-goals (Section 4); those remain Phase 10/12's or out of this phase's scope entirely |
| No real Jetson/TensorRT hardware is available to validate this phase's hardware-specific claims, the same recurring sandbox-limitation pattern every prior phase has documented | Flagged explicitly in Non-goals and expected in Known gaps once implementation starts, rather than presented as verified when it is not |

(See also [[Initial_Risk_Register]] for platform-wide risks.)

## 11. Open questions

- **Edge runtime language/inference strategy** (Section 7's `ADR-010`):
  reimplement detection in Node against an ONNX Runtime Node binding
  (keeping `apps/edge-agent` a pure TypeScript package, consistent with
  its Phase 1 scaffold), or run/embed the existing Python pipeline as a
  subprocess or sidecar (reusing `OnnxDetectorAdapter`/`filters.py`/
  `tracker.py` unchanged, at the cost of a second language runtime on
  the edge device). Neither [[Technology_Decisions]] nor
  [[Architecture_Overview]] states a position today — this is a real
  gap, not a formality, and must not be assumed either way without the
  ADR.
- **Device identity/sync transport** (Section 7's `ADR-011`): a
  pre-provisioned bearer token (simplest, matches the existing
  `VISION_SERVICE_MODEL_REGISTRY_API_TOKEN` pattern) versus a proper
  per-device API key/registration flow; and whether synced events reach
  `apps/api` over a new HTTP ingestion endpoint versus a direct Kafka
  producer connection from the edge (a materially different trust
  boundary — resolve with the zero-trust/least-privilege priority
  [[Quality_Attributes]] places first).
- What "approved local video source" means concretely for REQ-9.2 in
  this platform's synthetic/demo scope — a looped fixture file (mirroring
  Phase 4/5's `samples/sample-mission-clip.mp4` approach) versus a real
  attached camera/RTSP source — resolve during Section 6 step 3,
  consistent with every prior phase's preference for deterministic,
  license-clean fixtures over hardware dependencies where verification
  matters more than realism.
- The exact bounded-storage/backpressure policy for REQ-9.8 (a fixed
  row/byte cap with oldest-first eviction, versus time-based retention,
  versus refusing new writes once full) — resolve during Section 6
  step 5.
- Whether `aidefense.device-events` needs a consumer in `apps/api` in
  this phase, or whether — mirroring Phase 3's own precedent of
  declaring `aidefense.telemetry`/`aidefense.audit`/
  `aidefense.device-events` with "no producer or consumer —
  intentionally deferred" — this phase only adds the producer side and
  leaves a real read/query path for a later phase or for Phase 11's
  observability work. Recommend building at least a minimal consumer
  here, since REQ-9.11's whole point is that device health becomes
  observable, not merely published into a topic nothing reads.
- Whether the edge agent's video capture and local-inference
  responsibilities belong in one process or should be split into
  separate processes/containers (e.g., a lightweight Node
  orchestrator/sync client plus a separate inference container) —
  informed directly by whichever way `ADR-010` resolves.

---

## Relationship to other documents

- Derived directly from the roadmap's "Phase 9 — Edge Runtime" entry in
  [[AI_Defense_Platform_Roadmap]]. Like [[PRD-Phase-8]], this PRD is
  **not** an MVP-slice reduction — [[MVP_Implementation_Plan]] defers
  all of Phase 9 past the MVP, so this PRD covers the roadmap's full
  stated deliverables.
- Structure mirrors [[PRD-Phase-1]] through [[PRD-Phase-8]].
- Turns `apps/edge-agent`'s Phase 1 stub (REQ-1.7) and the roadmap's
  Phase 9 bullet list into implementable requirements, the same
  "aspirational until a phase makes it real" transition
  [[PRD-Phase-7]] made for PostGIS geospatial data and [[PRD-Phase-8]]
  made for the `datasets`/`models` MinIO buckets — this phase makes it
  real for [[Architecture_Overview]]'s "Edge Runtime" container.
- Deliberately does not resolve the two architectural questions named
  in Section 2/7/11 (edge runtime language, device identity/sync
  transport) itself — those are ADR-level decisions to be made with
  full context during implementation, not guessed at here.

---

## Related Notes

- [[AI_Defense_Platform_Roadmap]]
- [[MVP_Implementation_Plan]]
- [[PRD-Phase-1]]
- [[PRD-Phase-3]]
- [[PRD-Phase-5]]
- [[PRD-Phase-8]]
- [[ADR-006-detection-model-and-tracker]]
- [[Detection_And_Tracking]]
- [[Technology_Decisions]]
- [[Architecture_Overview]]
- [[Repository_Structure]]
- [[Security_Baseline]]
- [[Coding_Standards]]
- [[Quality_Attributes]]
- [[Initial_Risk_Register]]
- [[Guiding_Principles]]
- [[Goals]]
- [[ADR-000-template]]
