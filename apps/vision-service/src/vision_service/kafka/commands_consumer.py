"""REQ-3.13: consumes MISSION_PROCESSING_REQUESTED from
`aidefense.commands` and publishes PROCESSING_STARTED/
PROCESSING_COMPLETED (or PROCESSING_FAILED) to
`aidefense.processing-events` as a stub — no video download or frame
iteration yet (PRD-Phase-3 non-goals; that's Phase 4).

`handle_command_message` is the testable core (idempotency, retry,
DLQ); `runner.py` wires it to a real aiokafka Consumer/Producer and
asyncpg pool.
"""

from __future__ import annotations

import json
from typing import Any, Protocol

from vision_service.events.envelope import create_envelope
from vision_service.events.payloads import (
    EVENT_TYPES,
    ProcessingCompletedPayload,
    ProcessingStartedPayload,
)
from vision_service.events.topics import Topics
from vision_service.observability import log

from .dead_letter import build_dead_letter_envelope
from .idempotency import FetchrowExecutor, mark_processed
from .retry import with_bounded_retry

CONSUMER_NAME = "vision-service"
RETRY_ATTEMPTS = 3
RETRY_BASE_DELAY_SECONDS = 0.2


class ProducerLike(Protocol):
    async def send_and_wait(self, topic: str, value: bytes, key: bytes) -> object: ...


async def _publish(producer: ProducerLike, topic: str, envelope: dict[str, Any], key: str) -> None:
    await producer.send_and_wait(
        topic,
        value=json.dumps(envelope).encode("utf-8"),
        key=key.encode("utf-8"),
    )


async def handle_command_message(
    raw_value: bytes,
    pool: FetchrowExecutor,
    producer: ProducerLike,
) -> None:
    envelope = json.loads(raw_value)
    log_context = {
        "eventId": envelope.get("eventId"),
        "eventType": envelope.get("eventType"),
        "correlationId": envelope.get("correlationId"),
    }

    if envelope.get("eventType") != EVENT_TYPES["MISSION_PROCESSING_REQUESTED"]:
        log("warn", "commands consumer: unknown eventType, skipping", **log_context)
        return

    # REQ-3.8: idempotency check-and-record before any side effect runs.
    is_new_event = await mark_processed(pool, envelope["eventId"], CONSUMER_NAME)
    if not is_new_event:
        log("info", "commands consumer: duplicate delivery, skipping", **log_context)
        return

    mission_id = envelope["payload"]["missionId"]
    correlation_id = envelope.get("correlationId")
    causation_id = envelope.get("eventId")

    async def process() -> None:
        # REQ-3.13: stub — PROCESSING_STARTED then immediately
        # PROCESSING_COMPLETED, no real work between them.
        started = create_envelope(
            event_type=EVENT_TYPES["PROCESSING_STARTED"],
            event_version=1,
            producer="vision-service",
            payload=ProcessingStartedPayload(missionId=mission_id),
            correlation_id=correlation_id,
            causation_id=causation_id,
        )
        await _publish(producer, Topics.PROCESSING_EVENTS, started.model_dump(), mission_id)

        completed = create_envelope(
            event_type=EVENT_TYPES["PROCESSING_COMPLETED"],
            event_version=1,
            producer="vision-service",
            payload=ProcessingCompletedPayload(
                missionId=mission_id,
                note="stub: no frame processing in Phase 3",
            ),
            correlation_id=correlation_id,
            causation_id=causation_id,
        )
        await _publish(producer, Topics.PROCESSING_EVENTS, completed.model_dump(), mission_id)

    def on_attempt_failed(attempt: int, error: Exception) -> None:
        log(
            "warn",
            "commands consumer: processing attempt failed",
            attempt=attempt,
            error=str(error),
            **log_context,
        )

    succeeded = await with_bounded_retry(
        process, RETRY_ATTEMPTS, RETRY_BASE_DELAY_SECONDS, on_attempt_failed
    )

    if succeeded:
        log(
            "info",
            "commands consumer: stub processing complete",
            missionId=mission_id,
            **log_context,
        )
        return

    dlq_envelope = build_dead_letter_envelope(
        envelope,
        Topics.COMMANDS,
        "STUB_PROCESSING_FAILED_AFTER_RETRIES",
        RETRY_ATTEMPTS,
        "vision-service",
    )
    await _publish(producer, Topics.DEAD_LETTER, dlq_envelope.model_dump(), mission_id)
    log("error", "commands consumer: exhausted retries, dead-lettered", **log_context)
