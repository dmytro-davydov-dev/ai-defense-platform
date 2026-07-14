"""Event envelope — Pydantic mirror of packages/event-schemas' TS types
(src/envelope.ts) and src/schemas/event-envelope.schema.json, per
docs/architecture/Coding_Standards.md's Events section and
docs/adr/ADR-005-event-schema-versioning.md's versioning policy.

Field names are deliberately camelCase (not idiomatic Python) so this
model, the JSON Schema, and the TS type share one vocabulary — that
parity is exactly what
apps/vision-service/tests/test_event_schema_sync.py checks in CI
(REQ-3.4). `# noqa: N815` per-file-ignore is set in pyproject.toml for
this reason.
"""

import uuid
from datetime import datetime, timezone
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict

TPayload = TypeVar("TPayload")

# Membership (not order) must match event-envelope.schema.json's
# `properties` keys and packages/event-schemas/src/envelope.ts's
# ENVELOPE_FIELD_NAMES exactly.
ENVELOPE_FIELD_NAMES = (
    "eventId",
    "eventType",
    "eventVersion",
    "occurredAt",
    "correlationId",
    "causationId",
    "producer",
    "payload",
)


class EventEnvelope(BaseModel, Generic[TPayload]):
    model_config = ConfigDict(frozen=True)

    eventId: str
    eventType: str
    eventVersion: int
    occurredAt: str
    correlationId: str
    causationId: str | None
    producer: str
    payload: TPayload


def create_envelope(
    *,
    event_type: str,
    event_version: int,
    producer: str,
    payload: TPayload,
    correlation_id: str | None = None,
    causation_id: str | None = None,
) -> EventEnvelope[TPayload]:
    """Mirrors packages/event-schemas' `createEnvelope()`. See its
    docstring for the "don't call twice for the same logical event"
    caveat around retries.
    """
    return EventEnvelope[TPayload](
        eventId=str(uuid.uuid4()),
        eventType=event_type,
        eventVersion=event_version,
        occurredAt=datetime.now(timezone.utc).isoformat(),
        correlationId=correlation_id or str(uuid.uuid4()),
        causationId=causation_id,
        producer=producer,
        payload=payload,
    )
