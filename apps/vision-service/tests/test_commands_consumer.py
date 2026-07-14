"""REQ-3.8/3.9/3.13, REQ-4.10/4.11/4.12: the real Phase 4 pipeline —
MinIO download, metadata extraction, bounded-memory frame iteration,
and PROCESSING_STARTED/COMPLETED/FAILED publishing — driven against
the committed synthetic fixture (`samples/sample-mission-clip.mp4`),
so no real MinIO/Kafka/Postgres is needed.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

from vision_service.events.payloads import EVENT_TYPES
from vision_service.events.topics import Topics
from vision_service.kafka.commands_consumer import handle_command_message

REPO_ROOT = Path(__file__).resolve().parents[3]
SAMPLE_VIDEO = REPO_ROOT / "samples" / "sample-mission-clip.mp4"


def envelope_bytes(**overrides: Any) -> bytes:
    envelope = {
        "eventId": "event-1",
        "eventType": EVENT_TYPES["MISSION_PROCESSING_REQUESTED"],
        "eventVersion": 1,
        "occurredAt": "2026-01-01T00:00:00Z",
        "correlationId": "corr-1",
        "causationId": None,
        "producer": "api",
        "payload": {"missionId": "mission-1", "videoObjectKey": "missions/mission-1/source.mp4"},
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


class FakeMinioClient:
    """Copies the committed fixture video to `dest_path` instead of
    talking to real MinIO — `handle_command_message` never
    distinguishes a real `MinioClient` from this fake beyond the
    `download_to` method it declares in its `MinioClientLike` Protocol.
    """

    def __init__(
        self, source_path: Path | None = None, download_error: Exception | None = None
    ) -> None:
        self.source_path = source_path or SAMPLE_VIDEO
        self.download_error = download_error
        self.downloaded_keys: list[str] = []

    def download_to(self, object_key: str, dest_path: str) -> None:
        if self.download_error is not None:
            raise self.download_error
        self.downloaded_keys.append(object_key)
        shutil.copy(self.source_path, dest_path)


async def test_publishes_started_then_completed_with_real_metadata_and_frame_count() -> None:
    pool = FakePool()
    producer = FakeProducer()
    minio_client = FakeMinioClient()

    await handle_command_message(envelope_bytes(), pool, producer, minio_client)

    assert minio_client.downloaded_keys == ["missions/mission-1/source.mp4"]
    assert len(producer.sent) == 2
    topics = [entry[0] for entry in producer.sent]
    assert topics == [Topics.PROCESSING_EVENTS, Topics.PROCESSING_EVENTS]

    started_envelope = producer.sent[0][1]
    assert started_envelope["eventType"] == "PROCESSING_STARTED"
    assert started_envelope["correlationId"] == "corr-1"
    assert started_envelope["causationId"] == "event-1"
    started_payload = started_envelope["payload"]
    assert started_payload["missionId"] == "mission-1"
    # REQ-4.6: real metadata from the fixture, not the Phase 3 stub's
    # missionId-only payload.
    assert started_payload["fps"] == 4.0
    assert started_payload["frameCount"] == 12
    assert started_payload["width"] == 64
    assert started_payload["height"] == 48
    assert started_payload["durationSeconds"] == 3.0
    assert len(started_payload["checksumSha256"]) == 64

    completed_envelope = producer.sent[1][1]
    assert completed_envelope["eventType"] == "PROCESSING_COMPLETED"
    completed_payload = completed_envelope["payload"]
    # REQ-4.2/4.10: the real, verified per-frame count from iteration —
    # matches ProcessingStartedPayload.frameCount for this fixture
    # since every frame decodes cleanly.
    assert completed_payload["frameCount"] == 12
    assert completed_payload["processingDurationMs"] >= 0
    assert "Phase 4" in completed_payload["note"]
    assert producer.sent[0][2] == "mission-1"


async def test_skips_a_duplicate_delivery() -> None:
    pool = FakePool(already_processed=True)
    producer = FakeProducer()
    minio_client = FakeMinioClient()

    await handle_command_message(envelope_bytes(), pool, producer, minio_client)

    assert producer.sent == []
    assert minio_client.downloaded_keys == []


async def test_skips_an_unknown_event_type() -> None:
    pool = FakePool()
    producer = FakeProducer()
    minio_client = FakeMinioClient()

    await handle_command_message(
        envelope_bytes(eventType="SOMETHING_ELSE"), pool, producer, minio_client
    )

    assert producer.sent == []
    assert minio_client.downloaded_keys == []


async def test_dead_letters_after_exhausting_retries() -> None:
    pool = FakePool()
    # Processing-events publish fails every attempt (including the
    # STARTED publish and the PROCESSING_FAILED announcement below); the
    # DLQ topic itself is healthy, so the dead-letter publish succeeds —
    # REQ-3.9's "acknowledged (not redelivered forever)" behavior.
    producer = FakeProducer(fail_topics={Topics.PROCESSING_EVENTS})
    minio_client = FakeMinioClient()

    await handle_command_message(envelope_bytes(), pool, producer, minio_client)

    assert len(producer.sent) == 1
    topic, dlq_envelope, key = producer.sent[0]
    assert topic == Topics.DEAD_LETTER
    assert key == "mission-1"
    assert dlq_envelope["causationId"] == "event-1"
    assert dlq_envelope["payload"]["attempts"] == 3
    assert dlq_envelope["payload"]["topic"] == Topics.COMMANDS


async def test_download_failure_publishes_processing_failed_and_dead_letters() -> None:
    """REQ-4.11: an unrecoverable MinIO download failure (e.g. a
    missing object) publishes PROCESSING_FAILED with a structured
    reason — apps/api's processing-events.handler.ts maps this to
    Mission FAILED — in addition to the existing DLQ publish.
    """
    pool = FakePool()
    producer = FakeProducer()
    minio_client = FakeMinioClient(download_error=RuntimeError("object not found in MinIO"))

    await handle_command_message(envelope_bytes(), pool, producer, minio_client)

    assert len(producer.sent) == 2
    failed_topic, failed_envelope, failed_key = producer.sent[0]
    assert failed_topic == Topics.PROCESSING_EVENTS
    assert failed_envelope["eventType"] == "PROCESSING_FAILED"
    assert failed_key == "mission-1"
    assert failed_envelope["payload"]["missionId"] == "mission-1"
    assert "object not found in MinIO" in failed_envelope["payload"]["reason"]

    dlq_topic, dlq_envelope, _ = producer.sent[1]
    assert dlq_topic == Topics.DEAD_LETTER
    assert dlq_envelope["payload"]["attempts"] == 3
