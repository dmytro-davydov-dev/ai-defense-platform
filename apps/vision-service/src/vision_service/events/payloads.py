"""Per-eventType payload models, Pydantic mirror of
packages/event-schemas/src/schemas/*.schema.json and src/payloads.ts.
See envelope.py's module docstring for why field names are camelCase.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict

EVENT_TYPES = {
    "MISSION_PROCESSING_REQUESTED": "MISSION_PROCESSING_REQUESTED",
    "PROCESSING_STARTED": "PROCESSING_STARTED",
    "PROCESSING_COMPLETED": "PROCESSING_COMPLETED",
    "PROCESSING_FAILED": "PROCESSING_FAILED",
    # Phase 5 (docs/mvp-plan/PRD-Phase-5.md REQ-5.6).
    "DETECTION_PUBLISHED": "DETECTION_PUBLISHED",
}

# ADR-005: eventVersion is scoped per eventType, not global.
EVENT_VERSIONS = {
    "MISSION_PROCESSING_REQUESTED": 1,
    "PROCESSING_STARTED": 1,
    "PROCESSING_COMPLETED": 1,
    "PROCESSING_FAILED": 1,
    "DETECTION_PUBLISHED": 1,
}


class MissionProcessingRequestedPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    missionId: str
    videoObjectKey: str


MISSION_PROCESSING_REQUESTED_FIELD_NAMES = ("missionId", "videoObjectKey")


class ProcessingStartedPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    missionId: str
    # REQ-4.6, optional: absent for events still on the Phase 3 stub shape.
    durationSeconds: float | None = None
    fps: float | None = None
    width: int | None = None
    height: int | None = None
    frameCount: int | None = None
    checksumSha256: str | None = None


PROCESSING_STARTED_FIELD_NAMES = (
    "missionId",
    "durationSeconds",
    "fps",
    "width",
    "height",
    "frameCount",
    "checksumSha256",
)


class ProcessingCompletedPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    missionId: str
    note: str
    # REQ-4.10, optional: real frame count/duration once the Phase 4
    # pipeline is wired in.
    frameCount: int | None = None
    processingDurationMs: float | None = None
    # REQ-5.9, optional: populated once Phase 5's detection pipeline runs.
    detectionCount: int | None = None
    trackCount: int | None = None
    # REQ-5.7, optional: MinIO object key of the annotated output video.
    annotatedVideoObjectKey: str | None = None


PROCESSING_COMPLETED_FIELD_NAMES = (
    "missionId",
    "note",
    "frameCount",
    "processingDurationMs",
    "detectionCount",
    "trackCount",
    "annotatedVideoObjectKey",
)


class ProcessingFailedPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    missionId: str
    reason: str


PROCESSING_FAILED_FIELD_NAMES = ("missionId", "reason")


class DeadLetterPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    originalEvent: dict[str, Any]
    failureReason: str
    attempts: int
    topic: str


DEAD_LETTER_FIELD_NAMES = ("originalEvent", "failureReason", "attempts", "topic")


class DetectionBoundingBox(BaseModel):
    """Kept separate from `frames.models.BoundingBox` on purpose — the
    events layer does not depend on the frames-processing layer (same
    separation `envelope.py`/`payloads.py` already keep from
    `frames/*.py`, `annotation/*.py`).
    """

    model_config = ConfigDict(extra="ignore")

    x: float
    y: float
    width: float
    height: float


class DetectionPublishedPayload(BaseModel):
    """REQ-5.6: one retained (post-filter, post-tracking) detection,
    published to `aidefense.detections`. See
    packages/event-schemas/src/schemas/detection-published.schema.json
    for the field-by-field description this mirrors.
    """

    model_config = ConfigDict(extra="ignore")

    missionId: str
    frameIndex: int
    frameTimestampMs: float
    trackId: int
    label: str
    confidence: float
    boundingBox: DetectionBoundingBox


DETECTION_PUBLISHED_FIELD_NAMES = (
    "missionId",
    "frameIndex",
    "frameTimestampMs",
    "trackId",
    "label",
    "confidence",
    "boundingBox",
)
