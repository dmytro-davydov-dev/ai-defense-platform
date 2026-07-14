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
}

# ADR-005: eventVersion is scoped per eventType, not global.
EVENT_VERSIONS = {
    "MISSION_PROCESSING_REQUESTED": 1,
    "PROCESSING_STARTED": 1,
    "PROCESSING_COMPLETED": 1,
    "PROCESSING_FAILED": 1,
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


PROCESSING_COMPLETED_FIELD_NAMES = ("missionId", "note", "frameCount", "processingDurationMs")


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
