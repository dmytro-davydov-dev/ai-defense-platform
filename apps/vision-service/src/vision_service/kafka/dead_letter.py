"""REQ-3.9/3.10: builds the envelope published to `aidefense.dead-letter`
when a consumer exhausts its retry budget — Python mirror of
apps/api/src/kafka/dead-letter.ts.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from vision_service.events.envelope import EventEnvelope
from vision_service.events.payloads import DeadLetterPayload


def build_dead_letter_envelope(
    original_envelope: dict[str, Any],
    original_topic: str,
    failure_reason: str,
    attempts: int,
    producer: str,
) -> EventEnvelope[DeadLetterPayload]:
    payload = DeadLetterPayload(
        originalEvent=original_envelope,
        failureReason=failure_reason,
        attempts=attempts,
        topic=original_topic,
    )
    return EventEnvelope[DeadLetterPayload](
        eventId=str(uuid.uuid4()),
        eventType="EVENT_DEAD_LETTERED",
        eventVersion=1,
        occurredAt=datetime.now(timezone.utc).isoformat(),
        correlationId=original_envelope.get("correlationId") or str(uuid.uuid4()),
        causationId=original_envelope.get("eventId"),
        producer=producer,
        payload=payload,
    )
