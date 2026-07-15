---
title: "ADR-010: Edge Runtime Language and Inference Strategy"
type: adr
tags: [adr, phase9, edge]
status: accepted
---

# ADR-010: Edge Runtime Language and Inference Strategy

- Status: Accepted
- Date: 2026-07-15
- Decision owners: Dmytro
- Related documents: [[PRD-Phase-9]], [[ADR-006-detection-model-and-tracker]], [[MVP_Implementation_Plan]], [[Technology_Decisions]], [[Quality_Attributes]], [[Coding_Standards]], [[Detection_And_Tracking]]

## Context

`docs/mvp-plan/PRD-Phase-9.md` Section 7 requires this ADR to settle a
tension that Section 2 names explicitly: `apps/edge-agent` was
scaffolded in Phase 1 as a TypeScript/Node package (importing
`@ai-defense/observability`, the same package `apps/api` and
`apps/outbox-publisher` use), but the entire Phase 5 detector-adapter
contract and safety boundary — `DetectorAdapterLike`,
`OnnxDetectorAdapter`, `detection/filters.py`'s `ALLOWED_CLASSES`
enforcement, `detection/tracker.py` — is Python, living in
`apps/vision-service` ([[ADR-006-detection-model-and-tracker]]). REQ-9.3
requires the edge runtime to reuse that exact contract and allow-list,
not an independently-maintained copy — a second, hand-ported allow-list
in a different language is precisely the drift risk
[[Initial_Risk_Register]]'s "model accuracy is mistaken for certainty"
and this platform's permanent safety boundary (`README.md`) exist to
prevent.

## Decision

**`apps/edge-agent` stays TypeScript/Node** and becomes the edge
runtime's orchestrator: process lifecycle, `/health`/`/ready`, the local
SQLite event buffer, store-and-forward synchronization, device identity,
health reporting, and model resolution/download (REQ-9.1, 9.5–9.16).

**Local inference (REQ-9.3/9.4) is delegated to a new, minimal Python
sidecar** — `apps/vision-service/src/vision_service/edge/sidecar.py` —
that embeds Phase 5's existing building blocks completely unchanged:
`detection.factory.build_detector()`, `detection.filters.filter_detections()`
(and therefore `detection.classes.ALLOWED_CLASSES`), `detection.tracker.Tracker`,
and `video.reader.VideoReader`. The sidecar is a long-running child
process the Node edge-agent spawns and supervises; it reads a video
source path at startup, iterates frames via `VideoReader.frames()` (the
same bounded-memory generator `detection/pipeline.py` already uses), and
writes one newline-delimited JSON object per retained (post-filter,
post-tracking) detection to **stdout only** — no other data shares that
stream. All of the sidecar's own logging goes to **stderr only**,
deliberately not through `vision_service.observability.log()` (which
writes `info`/`debug` to stdout) — see Consequences below for why this
distinction matters.

The IPC contract is intentionally the simplest thing that works: one
JSON object per line, no length-prefixing, no RPC framework, no new
dependency on either side (Node's `child_process`/`readline` and
Python's `sys.stdout`/`json` are both already-available standard
library). This mirrors [[ADR-006-detection-model-and-tracker]]'s own
"Alternative C" reasoning for the in-house tracker: a ~100-line,
dependency-free integration is preferable to a message-queue or gRPC
library that this platform's recurring restricted-network-sandbox
constraint (every prior phase's Known gaps) would make risky to install
and verify.

**Model files reach the sidecar only as an already-resolved local
path.** The Node edge-agent resolves the current production model
(REQ-9.13, via [[PRD-Phase-8]]'s existing registry) and downloads it
itself (REQ-9.15, bandwidth-aware) to a local path, then passes that
path to the sidecar as a CLI argument/environment variable. The sidecar
never talks to the model registry or MinIO itself — it always takes the
explicit-path branch `detection.factory.build_detector()` already has
(`if settings.detection_model_path: return OnnxDetectorAdapter(...)`),
unmodified. This is a deliberate divergence from how
`apps/vision-service`'s own cloud-side factory resolves a model (direct
MinIO root-credential download, safe on the trusted Compose network) —
see [[ADR-011-device-identity-and-sync-transport]] for why an edge
device must not hold MinIO root credentials.

**TensorRT/Jetson-specific acceleration remains fully optional**, per
REQ-9.4: the sidecar's `OnnxDetectorAdapter` is unmodified from Phase 5,
so ONNX Runtime's `CPUExecutionProvider` is always the working fallback;
selecting `TensorrtExecutionProvider` when available is a future,
additive change to `OnnxDetectorAdapter`'s construction, isolated behind
the same adapter interface, not part of this decision's implementation.

## Alternatives considered

### Alternative A — embed the Python pipeline as a subprocess/sidecar (as decided)

Chosen: reuses `ALLOWED_CLASSES`/`OnnxDetectorAdapter`/`Tracker` with
zero duplication or hand-porting, so the safety boundary cannot drift
between the cloud and edge paths by construction. Cost: a device running
the edge agent needs both a Node and a Python runtime installed — a
real (acknowledged) increase in image size and deployment surface
versus a single-runtime agent.

### Alternative B — reimplement detection in Node against an ONNX Runtime Node binding

Would keep `apps/edge-agent` a single-language package, matching its
Phase 1 scaffold exactly. Rejected: it requires hand-porting
`ALLOWED_CLASSES`, the confidence-threshold filter, and the IoU tracker
into a second implementation in a second language — exactly the drift
risk this decision exists to avoid. It would also require evaluating
and pinning a Node ONNX Runtime binding
(`onnxruntime-node`) this platform has never installed or verified, an
additional unverified native dependency on top of every existing
sandbox network-installation constraint. A future contributor fixing a
filter/tracker bug would have to remember to fix it twice, in two
languages — a maintainability cost [[Quality_Attributes]] weighs highly
(priority 3, directly below security/reliability).

### Alternative C — rewrite `apps/edge-agent` entirely in Python

Would give the edge runtime one language end-to-end and let it import
`apps/vision-service`'s detection modules directly (same process, no
IPC). Rejected for now: it discards the Phase 1 scaffold (REQ-1.7)
entirely rather than building on it, and this platform's
buffering/sync/HTTP-client concerns (REQ-9.5–9.16) are no more natural
in Python than in Node — `apps/outbox-publisher` already demonstrates
this platform's house style for exactly this kind of small, standalone,
Postgres/HTTP-talking Node service. Revisit only if the sidecar
subprocess boundary (Alternative A) proves to be a real operational
burden on constrained edge hardware (e.g., two runtimes' combined memory
footprint is unacceptable on a specific target device) — a concern that
requires real Jetson hardware to evaluate, which this sandbox does not
have (see [[PRD-Phase-9]] Non-goals).

### Alternative D — a message queue or RPC framework (gRPC, ZeroMQ) between Node and Python

Rejected: adds a new dependency on both sides that must be installed
and verified in an environment that has repeatedly been unable to
install even well-established native packages (ByteTrack/BoT-SORT in
Phase 5, `ultralytics`/`torch` in Phase 8). Newline-delimited JSON over
stdio needs nothing beyond each language's standard library.

## Consequences

### Positive

- The Phase 5 safety boundary (`ALLOWED_CLASSES`) and the exact
  `OnnxDetectorAdapter`/`Tracker` behavior are reused byte-for-byte at
  the edge — there is no second place this logic could drift.
- No new native or network-fetched dependency is introduced by the IPC
  mechanism itself.
- `apps/edge-agent`'s Phase 1 scaffold is extended, not discarded.

### Negative

- An edge deployment needs two language runtimes (Node + Python) rather
  than one — a real increase in image size and operational surface
  versus either single-runtime alternative. Documented as an explicit,
  accepted cost, not an oversight.
- The stdio IPC boundary means the sidecar's stdout must never carry
  anything except the newline-delimited JSON detection protocol — a
  discipline enforced by code convention (the sidecar must not call
  `vision_service.observability.log()`, which writes to stdout for
  `info`/`debug`), not by a language-level guarantee. A future change
  that reintroduces a stray `print()` in the sidecar module would
  silently corrupt the protocol; this is called out prominently in the
  sidecar module's own docstring.
- Process supervision (restart-on-crash, backpressure if Node falls
  behind reading stdout) is now the Node edge-agent's responsibility,
  a new category of failure mode this platform's other services don't
  have (they don't supervise child processes).

### Risks

- Not verified against a real, multi-runtime container image or real
  Jetson hardware in this sandbox — the same category of gap as every
  prior phase's "written, reviewed, not run end-to-end" Known gaps.

## Migration and rollback

No migration — `apps/edge-agent`'s Phase 1 stub had no behavior to
preserve. Rollback is reverting to the stub (`log("info", "edge-agent
stub — no-op until Phase 9")`) with no data-model consequence, since the
sidecar and buffer are new, additive components.

## Review date

Revisit if: real Jetson hardware deployment shows the two-runtime image
size/footprint is unacceptable (Alternative C becomes attractive); a
Node-native ONNX Runtime binding becomes a well-established,
sandbox-installable dependency and the maintenance cost of Alternative
B is reassessed; or TensorRT-specific acceleration requires a change to
`OnnxDetectorAdapter`'s construction beyond what its current interface
supports.

---

## Related Notes

- [[PRD-Phase-9]] — the requirements this ADR resolves Section 7 for.
- [[ADR-006-detection-model-and-tracker]] — the detector/tracker/safety-boundary contract reused unchanged here.
- [[ADR-011-device-identity-and-sync-transport]] — why the sidecar never resolves its own model from the registry/MinIO directly.
- [[Technology_Decisions]] — ONNX Runtime as the portable inference runtime this decision builds on.
- [[Quality_Attributes]] — Maintainability priority behind rejecting Alternative B.
- [[Initial_Risk_Register]] — GPU-portability and model-accuracy-mistaken-for-certainty risks this decision addresses.
