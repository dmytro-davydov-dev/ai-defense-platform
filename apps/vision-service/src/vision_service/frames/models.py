"""REQ-4.9: `Frame`/`Detection` Pydantic contracts, mirroring the shape
`packages/event-schemas` will eventually carry on `aidefense.detections`
once Phase 5 populates it — this phase's stub pipeline never
constructs a `Detection` with real values (PRD-Phase-4 non-goals), but
`annotation/draw.py` and this module's own tests exercise both models
against hand-built fixtures.

Field names are deliberately camelCase (not idiomatic Python), for the
same reason `events/envelope.py` uses camelCase: these models are
expected to become the Pydantic side of a JSON-Schema-backed wire
contract in Phase 5, and starting from the wire vocabulary now avoids a
rename later. `# noqa: N815`-equivalent handled via pyproject.toml's
per-file-ignores, same pattern as `events/*.py`.

`Frame` deliberately does NOT carry raw pixel data — a NumPy array
isn't JSON-serializable and doesn't belong on an event's wire payload.
It carries only what Phase 5/6 need before any real detection exists:
frame index, timestamp, and `HxWxC` shape. The actual decoded ndarray
stays in-process, passed alongside a `Frame` instance where needed
(e.g. to `annotation.draw.draw_detections`), never inside the model
itself.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class BoundingBox(BaseModel):
    """Pixel-space box in the frame it was detected on: `(x, y)` is the
    top-left corner, `width`/`height` extend right/down from it —
    OpenCV's own rectangle convention, so `annotation.draw` can pass
    these straight to `cv2.rectangle` with no coordinate translation.
    """

    model_config = ConfigDict(extra="ignore")

    x: float
    y: float
    width: float
    height: float


class Detection(BaseModel):
    """Phase 4 left this unpopulated in practice (`annotation/draw.py`
    was unit-tested only against hand-constructed instances). Phase 5
    (docs/mvp-plan/PRD-Phase-5.md) is the first phase to construct real
    instances: `detection.onnx_detector.OnnxDetectorAdapter.detect()`
    returns them with `trackId` unset, and
    `detection.tracker.Tracker.update()` is the only place `trackId`
    gets populated (REQ-5.5) — every `Detection` that reaches
    `annotation.draw.draw_detections` or an `aidefense.detections`
    event has already been through both the tracker and REQ-5.3/5.4's
    filtering.
    """

    model_config = ConfigDict(extra="ignore")

    label: str
    confidence: float = Field(ge=0.0, le=1.0)
    boundingBox: BoundingBox
    # REQ-5.5, optional: unset until detection.tracker.Tracker assigns
    # a stable ID; stays None for hand-built fixtures in tests that
    # never go through the tracker.
    trackId: int | None = Field(default=None)


class Frame(BaseModel):
    """`height`/`width`/`channels` document the `HxWxC` shape of the
    ndarray this Frame describes, per
    docs/architecture/Coding_Standards.md's "NumPy array shapes
    documented" rule — `channels` defaults to 3 (BGR), OpenCV's native
    decode order for both `VideoReader.frames()` and `read_image()`.
    """

    model_config = ConfigDict(extra="ignore")

    frameIndex: int = Field(ge=0)
    timestampMs: float = Field(ge=0.0)
    height: int = Field(gt=0)
    width: int = Field(gt=0)
    channels: int = Field(default=3, gt=0)
    detections: list[Detection] = Field(default_factory=list)
