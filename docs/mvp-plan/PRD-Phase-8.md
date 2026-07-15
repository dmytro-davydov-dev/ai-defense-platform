---
title: "PRD — Phase 8: Data, Training and Model Lifecycle"
type: prd
tags: [prd, phase8, mlops]
status: draft
---

# PRD — Phase 8: Data, Training and Model Lifecycle

Version: 1.0
Status: Draft
Date: 2026-07-15
Owner: Dmytro
Related documents: [[AI_Defense_Platform_Roadmap]], [[MVP_Implementation_Plan]], [[PRD-Phase-5]], [[PRD-Phase-7]], [[ADR-006-detection-model-and-tracker]], [[Detection_And_Tracking]], [[Technology_Decisions]], [[Architecture_Overview]], [[Repository_Structure]], [[Security_Baseline]], [[Coding_Standards]], [[Initial_Risk_Register]], [[Guiding_Principles]], [[Goals]]

---

## 1. Summary

Phase 8 is the roadmap's "Data, Training and Model Lifecycle" phase —
the first phase entirely **outside MVP scope**. [[MVP_Implementation_Plan]]
scopes and sequences only roadmap Phases 1–7 into the MVP and explicitly
lists "Phase 8 (dataset registry, training pipeline, model
lifecycle/MLOps)" under "Explicitly deferred past MVP." [[PRD-Phase-7]]
confirms this: "Phase 7 (MVP slice) is the last phase
[[MVP_Implementation_Plan]] scopes; Phases 8+ are explicitly deferred
past the MVP." This PRD is therefore scoped against the roadmap's full
"Phase 8 — Data, Training and Model Lifecycle" entry directly, not
against an MVP-slice subset the way [[PRD-Phase-7]] was.

Phase 8 introduces controlled MLOps capabilities: a dataset registry
with provenance/licensing metadata, an annotation import workflow,
deterministic train/validation/test splits, experiment tracking, a YOLO
training pipeline with ONNX export, evaluation reports with bias/failure
analysis, a model registry, and promotion/rollback. Its end state turns
Phase 5's currently-unset detector model
(`VISION_SERVICE_DETECTION_MODEL_PATH` empty, `OnnxDetectorAdapter`
never exercised against a real model, per [[ADR-006-detection-model-and-tracker]]
and [[Detection_And_Tracking]]) into a real, governed, trained artifact
that this platform can produce, evaluate, and promote itself — with a
recorded lineage — rather than one assumed to exist and dropped in from
outside the system.

## 2. Problem statement

[[Detection_And_Tracking]] states plainly: "No trained `.onnx` model
file exists in this repository or has been run through
`OnnxDetectorAdapter` in this sandbox." [[ADR-006-detection-model-and-tracker]]'s
own "Review date" section names the gap this phase must close: "revisit
if ... Phase 8's model registry needs a detector-adapter contract richer
than the one defined here." Today, producing a real model would have to
happen entirely outside the platform, with no record of what data it was
trained on, under what license, with what result, or why it was judged
fit to promote — which is exactly the top entry in
[[Initial_Risk_Register]]: "Model accuracy is mistaken for certainty,"
whose stated mitigation is "Show confidence, provenance and review
requirements." None of that exists yet.

[[Architecture_Overview]]'s MinIO/S3 section already lists "datasets"
and "model artifacts" among its responsibilities, and
[[Repository_Structure]] reserves top-level `datasets/` and `models/`
folders with the rule "datasets and model binaries are not committed
unless explicitly licensed and small" — but neither folder exists yet
and neither responsibility is real. This is the same "aspirational until
a phase makes it real" pattern [[PRD-Phase-7]] closed for PostGIS
geospatial data; Phase 8 closes it for datasets and models. There is
also no annotation workflow, no experiment tracker, no evaluation
report, and no promotion/rollback path — an operator or AI engineer
(one of the five roles [[Goals]] names) has no way to produce or govern
a model within the platform at all.

## 3. Goals

- A dataset registry: Postgres-backed metadata (name, version, storage
  location, source, collection method, license) pointing at
  dataset content stored in MinIO — metadata in Postgres, binaries in
  object storage, the same division of responsibility every prior phase
  has used for large artifacts.
- Mandatory provenance and licensing metadata on every registered
  dataset, enforced before the dataset can be used in training —
  operationalizes the platform-wide safety boundary (`README.md`:
  no classified, illegally obtained, or privacy-invasive data) and
  [[Initial_Risk_Register]]'s "Sensitive data enters repository"
  mitigation ("Data policy, scanning and synthetic fixtures").
- An annotation import/export path built on an existing, standard
  bounding-box annotation format, converting to and from the platform's
  existing `Detection`/`BoundingBox` contracts — not a custom
  annotation UI (see Non-goals).
- Deterministic, seeded train/validation/test split generation, with the
  split recorded so it is reproducible from the same dataset version.
- Experiment tracking (MLflow or an equivalent) recording every training
  run's hyperparameters, dataset/split version, per-epoch metrics, and
  the exact code version (git commit) that produced it.
- A YOLO training pipeline that exports to ONNX in the exact format
  [[ADR-006-detection-model-and-tracker]] already committed
  `OnnxDetectorAdapter` to (opset ≥ 12, static 640×640 input, standard
  Ultralytics `(1, 4+80, N)` output) — a promoted model must drop into
  the existing adapter unchanged, not require a new postprocessing
  branch.
- Evaluation reports per training run: per-class precision/recall/mAP
  against the held-out test split, using threshold-based pass/fail
  checks, per [[Coding_Standards]]'s "model behavior: evaluation
  fixtures and threshold-based checks."
- A model registry tracking every exported artifact's lineage (training
  run, dataset version, evaluation report) through lifecycle stages
  (candidate → staged → production).
- Promotion and rollback: promoting updates the value
  `OnnxDetectorAdapter` resolves at startup without a code change —
  the exact mechanism [[ADR-006-detection-model-and-tracker]]'s
  "Migration and rollback" section already describes in reverse
  ("Rollback is setting `VISION_SERVICE_DETECTION_MODEL_PATH` back to
  unset"). Both actions are audited, per REQ-2.10's audit baseline.
- Bias and failure analysis: a per-class breakdown flagging classes with
  materially lower recall/precision than the dataset average, plus
  human-recorded notes on known failure cases — directly operationalizing
  [[Initial_Risk_Register]]'s "Show confidence, provenance and review
  requirements" mitigation, not just producing an aggregate accuracy
  number.
- The Phase 5 safety boundary carries forward unchanged: this phase adds
  tooling to produce and govern a model, not a path to expand
  `detection/classes.py`'s `ALLOWED_CLASSES` allow-list. A trained
  model's raw output is still filtered by the same shared
  `filters.py` stage regardless of what the model itself was trained to
  predict (per [[ADR-006-detection-model-and-tracker]]'s "Alternative D").

## 4. Non-goals (explicitly out of scope for Phase 8)

- A custom-built annotation UI — this phase consumes annotations
  produced by an existing open-source tool's export format (resolved by
  Section 7/11); building an annotation editor from scratch is not in
  scope.
- GPU cluster or distributed training infrastructure — this phase's
  pipeline runs on a single machine (CPU or a single GPU if present); no
  cluster scheduling. GPU scheduling at scale is Phase 12's concern
  (Kubernetes and Delivery Platform); TensorRT-specific edge optimization
  is Phase 9's.
- Automated or continuously-triggered retraining (e.g., a CI job that
  retrains on new data automatically) — this phase's pipeline is
  manually triggered only.
- Real-time or online learning — batch training only, against a fixed,
  versioned dataset snapshot.
- Any dataset or annotation involving classified, illegally obtained, or
  privacy-invasive data, under any circumstance — the platform-wide
  safety boundary (`README.md`, [[Guiding_Principles]]) applies to this
  phase's dataset registry exactly as it applies to Phase 5's detection
  output.
- Expanding `detection/classes.py`'s `ALLOWED_CLASSES` to any weapon,
  munitions, or targeting-relevant category — this phase's tooling must
  not, by construction, provide a path around that boundary.
- Fully automated model deployment (a promoted model auto-restarting a
  running `vision-service` with zero operator action) — promotion
  updates the registry and the resolved model reference; actually
  restarting/redeploying `vision-service` to pick it up remains a manual
  step until Phase 12's GitOps/progressive-delivery tooling exists.
- Kubernetes-orchestrated training jobs — local/Compose or single-host
  execution only, consistent with Docker Compose remaining the
  platform's deployment target until Phase 12.
- Automated bias-detection algorithms (e.g., fairness metrics, causal
  analysis) — this phase's bias/failure analysis is a documented,
  human-reviewed report (per-class metrics plus human-written notes),
  not an automated detection system.

## 5. Requirements

### 5.1 Dataset registry and provenance

- REQ-8.1: A dataset registry (new Postgres table(s) via standard Prisma
  models — no PostGIS-style unsupported column type is needed here,
  unlike Phase 7's telemetry table) records dataset id, name, version,
  MinIO storage location, source, collection method, license, and
  timestamps. Dataset content itself lives in MinIO under a `datasets/`
  prefix; Postgres holds only metadata, mirroring every prior phase's
  binary-artifact pattern.
- REQ-8.2: A dataset registry entry cannot be marked usable for training
  unless its provenance and license fields are non-empty; registration
  without them is rejected with a clear validation error — operationalizes
  the platform's safety boundary and [[Initial_Risk_Register]]'s
  "Sensitive data enters repository" mitigation.
- REQ-8.3: Deterministic train/validation/test split generation from a
  registered dataset, seeded for reproducibility; the seed and split
  boundaries are recorded alongside the dataset version so a later run
  reproduces the identical split.

### 5.2 Annotation workflow

- REQ-8.4: An annotation import/export utility accepts a standard
  bounding-box annotation format (format choice resolved in Section 7)
  and converts it to/from the platform's existing `Detection`/
  `BoundingBox` contracts (`apps/vision-service/src/vision_service/frames/models.py`),
  so annotations produced by an existing open-source tool can be
  ingested without building a custom annotation UI.
- REQ-8.5: Annotation validation rejects malformed or out-of-bounds
  bounding boxes and any class outside `detection/classes.py`'s
  `ALLOWED_CLASSES` allow-list before a dataset can be marked ready for
  training — the safety boundary applies to training data, not only to
  inference output.

### 5.3 Experiment tracking and training pipeline

- REQ-8.6: A YOLO training pipeline (Ultralytics CLI/SDK) runs against a
  registered dataset/split and exports a trained checkpoint to ONNX
  matching [[ADR-006-detection-model-and-tracker]]'s exact export
  convention (opset ≥ 12, static 640×640 input, standard Ultralytics
  `(1, 4+80, N)` output) — a promoted model must load through the
  existing `OnnxDetectorAdapter` without a postprocessing change.
- REQ-8.7: Every training run is recorded in an experiment tracker
  (MLflow or an equivalent, resolved in Section 7) capturing
  hyperparameters, dataset/split version, per-epoch metrics, and the git
  commit the run was executed against — lineage, not just a results log.
- REQ-8.8: An evaluation report is generated per training run:
  per-class precision/recall/mAP against the held-out test split, using
  threshold-based pass/fail checks per [[Coding_Standards]]'s "model
  behavior: evaluation fixtures and threshold-based checks," not
  exact-match assertions (models are non-deterministic across
  environments, the same reasoning [[PRD-Phase-5]] used for REQ-5.12).

### 5.4 Model registry, promotion, and rollback

- REQ-8.9: A model registry records every exported `.onnx` artifact
  (MinIO-stored under a `models/` prefix) with its lineage (training
  run, dataset version, evaluation report reference) and a lifecycle
  stage: candidate → staged → production.
- REQ-8.10: A promotion action moves a candidate/staged model to
  production, updating the value `OnnxDetectorAdapter` resolves at
  startup (`VISION_SERVICE_DETECTION_MODEL_PATH` or a registry-backed
  equivalent, resolved in Section 11) without requiring a code change.
- REQ-8.11: A rollback action reverts the active production reference to
  any prior registered production version, with the same no-code-change
  property as REQ-8.10 — the multi-version analog of
  [[ADR-006-detection-model-and-tracker]]'s existing "unset reverts to
  `NullDetectorAdapter`" rollback note.
- REQ-8.12: Promotion and rollback actions produce an append-only audit
  record (who, when, from which version to which) — the same pattern
  REQ-2.10 established for every other mutating platform action.

### 5.5 Bias and failure analysis

- REQ-8.13: The evaluation report (REQ-8.8) includes a per-class
  breakdown that flags classes with materially lower recall/precision
  than the dataset average as a distinct, visible section — not buried
  inside an aggregate mAP number — directly operationalizing
  [[Initial_Risk_Register]]'s "Show confidence, provenance and review
  requirements" mitigation.
- REQ-8.14: Known failure cases observed against the test split
  (e.g., systematic false negatives/positives under specific conditions)
  are recorded as documented, human-written notes alongside the
  evaluation report — this phase does not implement automated
  bias-detection algorithms (see Non-goals).

### 5.6 Testing

- REQ-8.15: Unit tests cover dataset-registry validation (REQ-8.1/8.2),
  split-generation determinism (REQ-8.3), and annotation format
  conversion/validation (REQ-8.4/8.5).
- REQ-8.16: An integration/fixture-based test runs the training pipeline
  end-to-end against a small synthetic fixture dataset (mirroring
  Phase 4/5's deterministic `samples/` fixtures), asserting the exported
  ONNX model loads through the existing `OnnxDetectorAdapter` with no
  postprocessing change required.
- REQ-8.17: Promotion/rollback are covered by tests asserting the audit
  record (REQ-8.12) is written and that `OnnxDetectorAdapter`'s resolved
  model path changes accordingly.

## 6. Technical approach (ordered task list)

1. Resolve the ADRs required before implementation (Section 7):
   experiment-tracking/dataset-versioning tooling and annotation format.
2. Create the `datasets/` and `models/` top-level folders named in
   [[Repository_Structure]] (a `.gitkeep`/README describing the
   "not committed unless explicitly licensed and small" rule; actual
   dataset/model binaries live in MinIO, never in the repository) and
   the corresponding MinIO bucket/prefix conventions.
3. Add Prisma models and a standard migration for the dataset registry,
   split records, training runs, and model registry (REQ-8.1, 8.3, 8.7,
   8.9) — plain relational columns throughout, so (unlike Phase 7's
   PostGIS telemetry table) this is the first phase since Phase 3 that
   needs no `$queryRaw`/`$executeRaw` workaround.
4. Implement dataset registry endpoints in `apps/api` (register, list,
   get) with provenance/license validation (REQ-8.1/8.2), RBAC-gated the
   same way every other mutating endpoint is (REQ-2.5).
5. Implement the deterministic split-generation utility (REQ-8.3).
6. Implement the annotation import/export conversion utility
   (REQ-8.4/8.5), most likely inside `apps/vision-service` alongside the
   existing `frames/models.py` contracts it converts to/from.
7. Stand up the chosen experiment tracker (MLflow or equivalent) as a
   new Compose service; implement the training script (Ultralytics YOLO)
   that logs to it and exports to ONNX (REQ-8.6/8.7).
8. Implement evaluation-report generation, including the bias/failure
   sections (REQ-8.8, 8.13, 8.14).
9. Implement the model registry and promotion/rollback endpoints,
   wired to update the value `apps/vision-service` resolves for its
   active model, with audit logging (REQ-8.9-8.12).
10. Write unit and integration/fixture tests (REQ-8.15-8.17).
11. Update [[Detection_And_Tracking]] and
    [[ADR-006-detection-model-and-tracker]] (its own "Review date"
    section names this trigger), [[Architecture_Overview]]'s MinIO
    section (datasets/model artifacts move from aspirational to real,
    the same transition [[PRD-Phase-7]] made for PostGIS),
    [[Repository_Structure]] if the `datasets/`/`models/` folders need
    documentation beyond the existing rule, and
    `docs/roadmap/Progress.md`.

## 7. ADRs required before/during Phase 8

- **Experiment tracking and dataset versioning tooling** — next ADR
  number `ADR-008`. The roadmap names both "MLflow or equivalent" and
  "DVC or object-storage-based dataset versioning" as open alternatives
  without deciding between them; this ADR must settle both before
  Section 6 step 3 (schema) and step 7 (tracker service) are implemented,
  per [[Coding_Standards]]'s "significant architectural change" trigger,
  since this is Phase 8's first new external service dependency.
- **Annotation format and tooling** — next ADR number `ADR-009`. Must
  settle which standard bounding-box format (e.g., COCO JSON export from
  an existing open-source annotation tool, versus a minimal
  platform-defined schema) REQ-8.4's conversion utility targets, before
  Section 6 step 6 is implemented.

Both ADRs should use [[ADR-000-template]] and are written during
implementation, not as part of this PRD.

## 8. Success criteria / Definition of Done

- A dataset can be registered with mandatory provenance/license
  metadata, and a deterministic train/validation/test split can be
  generated and reproduced from it.
- Annotations from an existing open-source tool's export format can be
  imported and validated against the platform's `ALLOWED_CLASSES` safety
  boundary before a dataset is used in training.
- A training run against a registered dataset produces a trained
  checkpoint, exports it to ONNX in the exact format
  `OnnxDetectorAdapter` already expects, and is fully recorded in the
  experiment tracker (hyperparameters, dataset/split version, metrics,
  git commit).
- Every training run produces an evaluation report with per-class
  metrics, a flagged low-performing-class section, and human-written
  failure notes — not just an aggregate accuracy number.
- A model can be promoted to production and rolled back without a code
  change to `apps/vision-service`, and both actions are audited.
- Unit tests (REQ-8.15) and the fixture-based training/promotion tests
  (REQ-8.16/8.17) pass locally and in CI, or are written and
  gated/skippable with a documented reason if a live Compose stack or
  network access (for the training dependencies) is unavailable in the
  environment they were authored in — the same pattern every prior
  phase's Known gaps have used.
- `ADR-008` (experiment tracking/dataset versioning) and `ADR-009`
  (annotation format) are accepted before their respective implementation
  steps are merged.
- No change in this phase widens `detection/classes.py`'s
  `ALLOWED_CLASSES` allow-list or otherwise creates a path around the
  Phase 5 safety boundary.

## 9. Dependencies

- Upstream: Phase 5's detector adapter interface and safety boundary
  ([[ADR-006-detection-model-and-tracker]], `detection/classes.py`'s
  `ALLOWED_CLASSES`) — this phase produces models that must plug into
  that exact contract, not a new one. Phase 2's RBAC/audit patterns
  (REQ-2.5/REQ-2.10), reused for dataset-registry and promotion/rollback
  endpoints. [[Repository_Structure]]'s model-binary rule, which this
  phase's `datasets/`/`models/` folders and MinIO conventions must
  respect.
- This phase is the first to require a new class of infrastructure
  dependency (an experiment tracker) and the first new Compose service
  since Phase 3's Kafka distribution — sequence the ADR-008 decision
  before adding it to `infrastructure/compose/docker-compose.yml`.
- Blocks: nothing in the MVP — Phase 8 is explicitly post-MVP
  ([[MVP_Implementation_Plan]]). It is a soft prerequisite for a real
  (non-`NullDetectorAdapter`) detection model ever running in any
  environment, and its model registry/promotion contract is a candidate
  input to Phase 9's edge model deployment/rollback, though Phase 9 is
  not blocked on this phase's specific implementation choices.

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| A dataset or annotation set is registered without adequate provenance/license review, reintroducing the "sensitive data enters repository" risk at the metadata layer even though no dataset binary is committed to git | REQ-8.2 makes provenance/license metadata a hard validation gate, not an optional field, before a dataset can be used in training |
| Training-data annotations widen the effective class vocabulary beyond `ALLOWED_CLASSES`, creating pressure to expand the Phase 5 safety boundary to "use what was labeled" | REQ-8.5 validates annotation classes against the existing allow-list at import time, before a dataset is training-ready; the allow-list itself is not touched by this phase |
| Evaluation reports show only aggregate accuracy, letting a materially weak minority class hide behind a strong overall mAP — the exact "model accuracy mistaken for certainty" risk-register entry | REQ-8.13 makes the per-class low-performer breakdown a required report section, not an optional appendix |
| Experiment tracker or training pipeline introduces a new external/network dependency (model download, PyPI packages) that this platform's prior phases have repeatedly found unreliable in restricted-network sandboxes | Resolve tooling choice explicitly via ADR-008 with the sandbox constraint in view; gate training/tracker integration tests behind environment checks, per every prior phase's Known gaps pattern |
| A promoted model silently changes `OnnxDetectorAdapter`'s expected input/output shape, breaking inference without any code-level signal | REQ-8.6 constrains training/export to the exact shape [[ADR-006-detection-model-and-tracker]] already committed to; REQ-8.16's fixture test asserts a real load through the unmodified adapter |
| Promotion/rollback happens without an audit trail, breaking the accountability chain every other mutating action in this platform already has | REQ-8.12 requires the same append-only audit pattern as REQ-2.10, tested by REQ-8.17 |
| Scope creep into automated retraining, distributed/GPU training infrastructure, or a custom annotation UI | Explicit non-goals (Section 4); those remain future work, most of it outside this platform's roadmap phase for MLOps specifically |

(See also [[Initial_Risk_Register]] for platform-wide risks.)

## 11. Open questions

- MLflow vs a lighter-weight equivalent for experiment tracking, and DVC
  vs plain MinIO-prefix-based object-storage versioning for datasets —
  the roadmap names both pairs as open alternatives; resolve via
  `ADR-008` (Section 7), weighing this platform's recurring
  restricted-network-sandbox constraint against feature completeness.
- COCO JSON (exportable from many existing open-source annotation tools,
  e.g. CVAT) versus a minimal platform-defined annotation schema —
  resolve via `ADR-009` (Section 7).
- Whether `VISION_SERVICE_DETECTION_MODEL_PATH` remains the mechanism
  `OnnxDetectorAdapter` resolves its active model from (with promotion
  writing that env var / a config value it reads), or whether the model
  registry needs its own resolution endpoint `vision-service` queries at
  startup — a design decision to make during Section 6 step 9, informed
  by how much runtime (vs. deploy-time) model-switching this phase
  actually needs to support.
- Whether dataset-registry and model-registry/promotion endpoints reuse
  the existing flat `operator`/`admin` RBAC roles ([[Security_Baseline]])
  or need a new role reflecting [[Goals]]'s "AI Engineer" user role —
  [[Security_Baseline]]'s own stated position is to add finer-grained
  roles "until Phase 6's frontend surfaces a concrete need"; Phase 8 may
  be the first concrete need. Recommend starting with `admin` reuse for
  simplicity and revisiting only if a real multi-operator conflict
  emerges, consistent with that document's existing reasoning.
- Where the annotation import step fits relative to dataset registration
  — whether annotations are a property of a dataset version, or a
  separate versioned entity referencing one — resolve during Section 6
  step 3 (schema design).

---

## Relationship to other documents

- Derived directly from the roadmap's "Phase 8 — Data, Training and
  Model Lifecycle" entry in [[AI_Defense_Platform_Roadmap]]. Unlike
  [[PRD-Phase-7]], this PRD is **not** an MVP-slice reduction of the
  roadmap scope — [[MVP_Implementation_Plan]] defers all of Phase 8 past
  the MVP, so this PRD covers the roadmap's full stated deliverables.
- Structure mirrors [[PRD-Phase-1]] through [[PRD-Phase-7]].
- Closes the gap [[ADR-006-detection-model-and-tracker]]'s own "Review
  date" section names ("Phase 8's model registry needs a
  detector-adapter contract richer than the one defined here") and the
  "not real yet" gap [[Detection_And_Tracking]] documents.

---

## Related Notes

- [[AI_Defense_Platform_Roadmap]]
- [[MVP_Implementation_Plan]]
- [[PRD-Phase-5]]
- [[PRD-Phase-7]]
- [[ADR-006-detection-model-and-tracker]]
- [[Detection_And_Tracking]]
- [[Technology_Decisions]]
- [[Architecture_Overview]]
- [[Repository_Structure]]
- [[Security_Baseline]]
- [[Coding_Standards]]
- [[Initial_Risk_Register]]
- [[Guiding_Principles]]
- [[Goals]]
- [[ADR-000-template]]
