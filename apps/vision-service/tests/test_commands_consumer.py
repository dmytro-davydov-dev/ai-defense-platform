"""REQ-3.8/3.9/3.13: apps/vision-service's stub commands consumer."""

from __future__ import annotations

import json
from typing import Any

from vision_service.events.payloads import EVENT_TYPES
from vision_service.events.topics import Topics
from vision_service.kafka.commands_consumer import handle_command_message


def envelope_bytes(**overrides: Any) -> bytes:
    envelope = {
        "eventId": "event-1",
        "eventType": EVENT_TYPES["MISSION_PROCESSING_REQUESTED"],
        "eventVersion": 1,
        "occurredAt": "2026-01-01T00:00:00Z",
        "correlationId": "corr-1",
        "causationId": None,
        "producer": "api",
        "payload": {"missionId": "mission-1", "videoObjectKey": "k"},
        **overrides,
    }
    return json.dumps(envelope).encode("utf-8")


class FakePool:
    def __init__(self, already_processed: bool = False) -> None:
        self.already_processed = already_processed

    async def fetchrow(self, query: str, *args: object) -> object | None:
        return None if self.already_processed else {"id": args[0]}


class FakeProducer:
    def __init__(self, fail_topics: set[str] | None = None) -> None:
        self.fail_topics = fail_topics or set()
        self.sent: list[tuple[str, dict[str, Any], str]] = []

    async def send_and_wait(self, topic: str, value: bytes, key: bytes) -> None:
        if topic in self.fail_topics:
            raise RuntimeError(f"broker unavailable for {topic}")
        self.sent.append((topic, json.loads(value), key.decode("utf-8")))


async def test_publishes_started_then_completed_for_a_new_command() -> None:
    pool = FakePool()
    producer = FakeProducer()

    await handle_command_message(envelope_bytes(), pool, producer)

    assert len(producer.sent) == 2
    topics = [entry[0] for entry in producer.sent]
    assert topics == [Topics.PROCESSING_EVENTS, Topics.PROCESSING_EVENTS]

    started_envelope = producer.sent[0][1]
    assert started_envelope["eventType"] == "PROCESSING_STARTED"
    assert started_envelope["correlationId"] == "corr-1"
    assert started_envelope["causationId"] == "event-1"
    assert started_envelope["payload"]["missionId"] == "mission-1"

    completed_envelope = producer.sent[1][1]
    assert completed_envelope["eventType"] == "PROCESSING_COMPLETED"
    assert producer.sent[0][2] == "mission-1"


async def test_skips_a_duplicate_delivery() -> None:
    pool = FakePool(already_processed=True)
    producer = FakeProducer()

    await handle_command_message(envelope_bytes(), pool, producer)

    assert producer.sent == []


async def test_skips_an_unknown_event_type() -> None:
    pool = FakePool()
    producer = FakeProducer()

    await handle_command_message(envelope_bytes(eventType="SOMETHING_ELSE"), pool, producer)

    assert producer.sent == []


async def test_dead_letters_after_exhausting_retries() -> None:
    pool = FakePool()
    # Processing-events publish fails every attempt; the DLQ topic
    # itself is healthy, so the dead-letter publish succeeds — REQ-3.9's
    # "acknowledged (not redelivered forever)" behavior.
    producer = FakeProducer(fail_topics={Topics.PROCESSING_EVENTS})

    await handle_command_message(envelope_bytes(), pool, producer)

    assert len(producer.sent) == 1
    topic, dlq_envelope, key = producer.sent[0]
    assert topic == Topics.DEAD_LETTER
    assert key == "mission-1"
    assert dlq_envelope["causationId"] == "event-1"
    assert dlq_envelope["payload"]["attempts"] == 3
    assert dlq_envelope["payload"]["topic"] == Topics.COMMANDS
