---
title: "ADR-008: Experiment Tracking and Dataset Versioning Tooling"
type: adr
tags: [adr, phase8, mlops]
status: accepted
---

# ADR-008: Experiment Tracking and Dataset Versioning Tooling

- Status: Accepted
- Date: 2026-07-15
- Decision owners: Dmytro
- Related documents: [[PRD-Phase-8]], [[AI_Defense_Platform_Roadmap]], [[Technology_Decisions]], [[Guiding_Principles]], [[Coding_Standards]], [[Repository_Structure]], [[ADR-006-detection-model-and-tracker]], [[Initial_Risk_Register]]

## Context

[[PRD-Phase-8]] Section 7 requires this ADR to settle two open
alternatives the roadmap names without deciding between: "MLflow or
equivalent" for experiment tracking, and "DVC or object-storage-based
dataset versioning" for datasets. Both choices gate Section 6 step 3
(schema) and step 7 (any new Compose service) of that PRD's technical
approach.

This platform has a repeated, documented pattern of heavy or
native-build-dependent external packages becoming unreliable or
unverifiable in this project's restricted-network sandbox:
`uv sync` cannot fetch a managed Python build
([[Progress]]'s Phase 1 Known gaps), `prisma generate` cannot reach
`binaries.prisma.sh` ([[Progress]]'s Phase 2 Known gaps), and
[[ADR-006-detection-model-and-tracker]]'s "Alternative C" rejected
`ByteTrack`/`BoT-SORT` specifically because their native-build
dependency chains (`cython-bbox`, `lap`, a ReID network) were
unreliable to install and verify here. MLflow's server has its own
dependency surface (Flask, SQLAlchemy, Gunicorn, a UI bundle) and DVC
typically expects its own remote/cache tooling on top of whatever
object store backs it — both add a materially heavier surface than
this phase's actual requirements (REQ-8.1–8.3, REQ-8.7) need.

## Decision

**Dataset versioning**: object-storage-based, using the MinIO
conventions already established by every prior phase (mission videos,
annotated outputs, telemetry files) — no DVC. A dataset's content lives
under a `datasets/{datasetId}/` MinIO prefix; Postgres holds only the
registry metadata (name, version, storage location, provenance,
license — REQ-8.1/8.2) and split manifests (REQ-8.3), the same division
of responsibility [[Architecture_Overview]] already documents for every
other binary artifact. "Versioning" here means a new `Dataset` row per
version (immutable once registered, per REQ-8.2's provenance gate), not
a content-addressed diffing system — sufficient for this phase's stated
requirements and consistent with Guiding Principle #15 ("Simplicity over
Complexity").

**Experiment tracking**: an in-house `TrainingRun` table in the same
Postgres database `apps/api` already owns, recording hyperparameters,
dataset/split version, per-epoch metrics, evaluation report (including
the REQ-8.13/8.14 bias/failure sections), and the git commit a run was
executed against — no MLflow server, no new Compose service. A training
run is recorded via one `POST /training-runs` call from
`apps/vision-service`'s training script after it completes (REQ-8.7),
mirroring how `apps/outbox-publisher` and Kafka consumers already treat
Postgres as the durable source of truth rather than a bespoke tracking
store.

The model registry (REQ-8.9) is a `ModelVersion` table in the same
database, referencing a `TrainingRun` and pointing at a MinIO-stored
`.onnx` artifact under a `models/{modelVersionId}/` prefix — the same
Postgres-metadata-plus-MinIO-binary pattern, not a new artifact store.

## Alternatives considered

### Alternative A — in-house Postgres/MinIO tracking, as decided

No new external service, no new dependency to install/verify in a
sandbox that has repeatedly failed to install comparable tooling. Reuses
exactly the pattern this platform already has for every other piece of
metadata-plus-binary state (missions/videos, telemetry-points/telemetry
files, detections). The full read/write surface this phase's
requirements name (register, list, get, split, record run, evaluate,
register model, promote, rollback, audit) is expressible as ordinary
NestJS CRUD/query endpoints against Postgres — nothing this phase
requires needs a purpose-built tracking UI or client library.

### Alternative B — MLflow for experiment tracking

Rejected for this phase: MLflow's tracking server is a new, standalone
service (its own Compose entry, its own backing store — SQLite or a
second Postgres schema — and its own Python/`mlflow` client dependency
in `apps/vision-service`), adding real operational surface for
capabilities (its web UI, artifact store abstraction, model staging UI)
this phase's requirements don't call for beyond what a `TrainingRun`
table already provides. Nothing in this decision forecloses MLflow
later: `apps/vision-service`'s training script talks to the registry
through a narrow `registry_client` module (Section 6), so swapping the
tracking backend is isolated to that one module and to `apps/api`'s
`training-runs` module — neither the detector-adapter contract nor the
model-registry's stage semantics (candidate/staged/production) would
need to change.

### Alternative C — DVC for dataset versioning

Rejected for this phase: DVC's typical workflow (`.dvc` pointer files
committed to git, a configured remote, `dvc pull`/`dvc push`) adds a new
CLI dependency and a parallel versioning mechanism alongside the
MinIO-based one every other phase already uses for large binaries.
[[Repository_Structure]]'s existing rule — "datasets and model binaries
are not committed unless explicitly licensed and small" — already
assumes binaries live outside git, which the MinIO-prefix approach
satisfies directly without adding DVC's remote-configuration layer on
top.

## Consequences

### Positive

- Zero new runtime dependencies in `apps/api` (already has Prisma, S3
  SDK) and no new Python dependency in `apps/vision-service` beyond a
  plain HTTP client for `registry_client` (`httpx`, already a dev
  dependency here — promoted to a runtime one, see Section 6 of
  [[PRD-Phase-8]]).
- No new Compose service, so nothing new this phase requires this
  sandbox's repeatedly-blocked network access (registry image pulls,
  `pip install mlflow`'s dependency tree, DVC's remote setup) to verify
  the *architecture*, only to verify a real end-to-end run — the same
  category of Known gap every prior phase has already logged.
- Dataset/model/training-run lineage is queryable with the same
  ordinary SQL tooling every other table in this schema already uses;
  no separate MLflow/DVC UI or CLI is required to inspect it.

### Negative

- No MLflow UI: comparing runs, browsing metrics over time, or a
  dedicated model-lineage graph view requires querying Postgres directly
  or building a page in `apps/web` — not scoped by [[PRD-Phase-8]].
- No DVC-style content-addressed deduplication or diffing between
  dataset versions — a new `Dataset` version is a full new registry
  entry pointing at its own MinIO prefix, with no automatic detection of
  unchanged files between versions.
- If a future phase's data-versioning needs grow past "one dataset
  version = one MinIO prefix plus Postgres metadata" (e.g., fine-grained
  per-file diffing, dataset merging), this decision will need revisiting
  — flagged in Review date below.

### Risks

- An in-house registry duplicates a small amount of what MLflow/DVC
  provide out of the box (e.g. a metrics-over-time UI). Acceptable
  given this phase's actual stated requirements (REQ-8.1–8.17) do not
  call for either.

## Migration and rollback

No migration — this is new functionality. Rollback is straightforward:
the `Dataset`/`DatasetSplit`/`TrainingRun`/`ModelVersion` tables can be
left in place unused if a later phase adopts MLflow/DVC instead; no
other module depends on their internal shape beyond
`apps/api`'s own `datasets`/`training-runs`/`model-registry` modules and
`apps/vision-service`'s `registry_client`.

## Review date

Revisit if: a real multi-operator/multi-experiment workflow makes a
dedicated experiment-tracking UI a demonstrated need rather than a
nice-to-have; dataset sizes or versioning cadence make MinIO-prefix
versioning unwieldy compared to DVC's content-addressed model; or a
future phase needs to compare training runs across more dimensions than
this schema's `metrics`/`evaluationReport` JSON columns comfortably
support.

---

## Related Notes

- [[PRD-Phase-8]] — the requirements this ADR resolves Section 7 for.
- [[Technology_Decisions]] — PostgreSQL/MinIO as platform-wide accepted choices this decision reuses.
- [[ADR-006-detection-model-and-tracker]] — "Alternative C"'s reasoning against unreliable-to-install external dependencies, applied here to MLflow/DVC.
- [[Repository_Structure]] — the dataset/model-binary rule this decision respects.
- [[Initial_Risk_Register]] — "Sensitive data enters repository," which this dataset-registry design mitigates via REQ-8.2's provenance gate.
- [[ADR-009-annotation-format]] — the companion ADR for Phase 8's annotation format.
