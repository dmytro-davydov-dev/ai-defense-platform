---
title: "ADR-006: Detection Model, Adapter Interface, and Tracker"
type: adr
tags: [adr, phase5]
status: accepted
---

# ADR-006: Detection Model, Adapter Interface, and Tracker

- Status: Accepted
- Date: 2026-07-14
- Decision owners: Dmytro
- Related documents: [[PRD-Phase-5]], [[MVP_Implementation_Plan]], [[Technology_Decisions]], [[Coding_Standards]], [[Repository_Structure]], [[Initial_Risk_Register]], [[Vision_Service_Shell]]

## Context

`docs/mvp-plan/PRD-Phase-5.md` Section 7 requires this ADR to settle
two decisions before implementation starts: which YOLO model/export
path backs the detector adapter (REQ-5.1/5.2), and which multi-object
tracker backs REQ-5.5. Both choices must stay CPU-only (this phase
stays off GPU/TensorRT, deferred to Phase 9 per the roadmap), must not
introduce a model binary into the repository (`docs/architecture/Repository_Structure.md`'s
"datasets and model binaries are not committed unless explicitly
licensed and small" rule), and must not, by construction, be able to
emit anything resembling a weapon-guidance or target-scoring class
(the platform's permanent safety boundary, `README.md`).

## Decision

**Model**: YOLOv8n (or an equivalent CPU-friendly Ultralytics YOLO
variant), COCO-pretrained, exported to ONNX (opset ≥ 12, static
640×640 input, standard Ultralytics `(1, 4+80, N)` output layout).
Run through **ONNX Runtime** with `CPUExecutionProvider` only —
`OnnxDetectorAdapter` (`apps/vision-service/src/vision_service/detection/onnx_detector.py`)
implements the REQ-5.1 adapter against this exact output shape.
COCO's 80 classes contain no weapon, munitions, or targeting-relevant
category to begin with, which makes the class allow-list (REQ-5.4) a
second, independent safety layer rather than the only one.

The model file itself is **not committed**. `Settings.detection_model_path`
(`VISION_SERVICE_DETECTION_MODEL_PATH`) defaults to `""`; when unset,
`vision_service.detection.factory.detector` resolves to a
`NullDetectorAdapter` that returns zero detections for every frame —
the same "disabled, not broken" treatment `kafka_brokers`/
`minio_root_user` already get in `settings.py`. This lets the full
Phase 5 pipeline (filtering, tracking, annotation, event publishing,
`PROCESSING_COMPLETED`) run end-to-end in this sandbox and in CI
without ever fetching real model weights; a real deployment mounts or
downloads the `.onnx` file and points the env var at it.

**Detector adapter interface** (REQ-5.1):

```python
class DetectorAdapterLike(Protocol):
    def detect(self, frame: np.ndarray) -> list[Detection]: ...
```

One method, one input (a decoded `HxWxC uint8` frame), one output (a
list of unfiltered, untracked `Detection` objects). Confidence
thresholding (REQ-5.3) and class-allow-list filtering (REQ-5.4) are
**not** the adapter's responsibility — they run as a separate stage
(`detection/filters.py`) that every adapter implementation shares, so
swapping the model never risks silently widening the safety filter.

**Tracker** (REQ-5.5): a minimal, in-house, dependency-free IoU tracker
(`detection/tracker.py`), not the external `ByteTrack`/`BoT-SORT`
packages named in the roadmap/PRD as options. Per-label greedy IoU
matching between the previous frame's live tracks and the current
frame's filtered detections; a track survives up to
`max_misses` (default 5) consecutive unmatched frames before being
dropped; an unmatched detection starts a new track ID. This is
deliberately a simplified, single-tier version of ByteTrack's
association idea (ByteTrack's second, low-confidence-detection
matching tier is redundant here because REQ-5.3 already drops
low-confidence detections before the tracker ever sees them).

## Alternatives considered

### Alternative A — YOLOv8n as decided

Smallest Ultralytics YOLO variant, well-documented ONNX export path,
runs acceptably on CPU for a small synthetic/demo fixture. Chosen.

### Alternative B — a larger/more accurate YOLO variant (YOLOv8s/m, YOLO11)

Better accuracy, materially worse CPU latency, no benefit for this
platform's MVP scope (a reference architecture, not an accuracy
benchmark). Deferred: the REQ-5.1 adapter interface makes swapping to
a larger variant a config change, not a code change, so this remains
available without committing to it now.

### Alternative C — pull in the external `ByteTrack` or `BoT-SORT` package

These are the trackers the roadmap and `docs/mvp-plan/MVP_Implementation_Plan.md`
name explicitly. Rejected for this phase: both pull in a native-build
dependency chain (`cython-bbox`, `lap`, `scipy`, and in BoT-SORT's
case a ReID network) that this sandbox's restricted network access
(GitHub release CDN unreachable, per every prior phase's Known gaps —
[[Vision_Service_Shell]]) makes unreliable to install and verify, and
that neither package is a stable, actively-maintained PyPI wheel
independent of a specific Ultralytics/MMDetection integration. A
~60-line, dependency-free, unit-testable IoU tracker satisfies REQ-5.5
(stable track IDs, track history) without that fragility. If accuracy
under occlusion/re-identification becomes a real requirement later,
swapping this out is isolated to `detection/tracker.py` and
`detection/pipeline.py`'s call site — nothing else depends on the
tracker's internals.

### Alternative D — apply the class allow-list inside the adapter

Rejected: would make every future adapter implementation independently
responsible for the safety boundary. Keeping the allow-list in a
single shared `filters.py` stage (Decision above) means the boundary
is enforced exactly once, regardless of which model is behind the
adapter.

## Consequences

### Positive

- The full detection→filter→track→annotate→publish pipeline is
  real, tested code from day one, runnable in any environment
  (including this sandbox) without a committed model binary or a
  network fetch during tests.
- The tracker has zero new dependencies — nothing to re-lock in
  `uv.lock`, no native build step, no GitHub-CDN dependency.
- The class allow-list is a single, reviewable constant
  (`detection/classes.py`), independent of model choice.

### Negative

- The in-house tracker is materially simpler than ByteTrack/BoT-SORT —
  no re-identification after a long occlusion, no Kalman-filter motion
  prediction between frames. Acceptable for the MVP's synthetic/demo
  scope; revisit only if a real evaluation shows it matters.
- `OnnxDetectorAdapter`'s postprocessing assumes the specific
  Ultralytics `(1, 4+num_classes, num_boxes)` YOLOv8 export layout — a
  different export tool or YOLO version may need a different
  postprocessing branch.

### Risks

- No real `.onnx` model file has been run through this adapter in this
  sandbox (no network access to fetch/export one here) — REQ-5.11's
  unit tests exercise the postprocessing math against a fake ONNX
  session with synthetic output, not a real model's real output
  distribution. A real model run on a normal dev machine remains open,
  same category of gap as Phase 4's Python-3.12/Docker verification.

## Migration and rollback

No migration — this is new functionality behind `NullDetectorAdapter`'s
safe default. Rollback is setting `VISION_SERVICE_DETECTION_MODEL_PATH`
back to unset, which reverts to zero-detection behavior without a code
change.

## Review date

Revisit if: a real trained/exported model is run against this adapter
and postprocessing needs correction; tracker accuracy becomes a
demonstrated problem; or Phase 8's model registry needs a
detector-adapter contract richer than the one defined here.

**Update (Phase 8):** [[PRD-Phase-8]] implemented the model registry
named above and it did **not** need a richer contract — REQ-8.6
constrains training/export to this ADR's exact shape (opset ≥ 12,
static 640×640 input, standard Ultralytics `(1, 4+80, N)` output) so a
promoted model loads through the unmodified `OnnxDetectorAdapter`
defined here. `detection/factory.py`'s `build_detector()` gained one new
resolution path (REQ-8.10: ask the registry for a production model
before falling back to `NullDetectorAdapter`), but `OnnxDetectorAdapter`
itself, its constructor signature, and its postprocessing are unchanged
by Phase 8. The "no real `.onnx` model has been run through this
adapter" risk below is also unchanged — Phase 8 could not install
`ultralytics`/`torch` in this sandbox either (see
[[Detection_And_Tracking]]'s "What's not real yet").

**Update (Phase 9):** [[PRD-Phase-9]] reused `OnnxDetectorAdapter`,
`filter_detections`, `ALLOWED_CLASSES`, and `Tracker` completely
unchanged inside a new subprocess wrapper
(`vision_service.edge.sidecar`, see
[[ADR-010-edge-runtime-language-and-inference-strategy]]) — the
detector-adapter contract this ADR defined needed no changes to run at
the edge either, the second phase in a row to confirm that. TensorRT
remains unimplemented (no Jetson hardware in this sandbox to validate
it against); `DetectorAdapterLike`'s existing swappable interface is
what would carry it whenever that hardware becomes available.

---

## Related Notes

- [[PRD-Phase-5]] — the requirements this ADR resolves Section 7 for.
- [[Technology_Decisions]] — YOLO/ONNX Runtime as platform-wide accepted choices.
- [[Coding_Standards]] — ADR trigger and Python conventions this decision follows.
- [[Repository_Structure]] — the model-binary rule this decision respects.
- [[Initial_Risk_Register]] — GPU-portability and model-accuracy-mistaken-for-certainty risks this decision addresses.
- [[PRD-Phase-8]] — the model registry that reuses this ADR's adapter contract unchanged.
- [[ADR-008-experiment-tracking-and-dataset-versioning]] — Phase 8's training/tracking tooling built around this contract.
