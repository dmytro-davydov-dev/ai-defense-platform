"""REQ-3.8/3.9/3.13, REQ-4.10/4.11/4.12, REQ-5.9/5.10: the real
pipeline — MinIO download, metadata extraction, detection/filter/
track/annotate (Phase 5), annotated-video upload, and
PROCESSING_STARTED/DETECTION_PUBLISHED*/COMPLETED/FAILED publishing —
driven against the committed synthetic fixture
(`samples/sample-mission-clip.mp4`), so no real MinIO/Kafka/Postgres/
ONNX Runtime is needed.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

from vision_service.detection.adapter import NullDetectorAdapter
from vision_service.events.payloads import EVENT_TYPES
from vision_service.events.topics import Topics
from vision_service.frames.models import BoundingBox, Detection
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
    `download_to`/`upload_from` methods it declares in its
    `MinioClientLike` Protocol.
    """

    def __init__(
        self, source_path: Path | None = None, download_error: Exception | None = None
    ) -> None:
        self.source_path = source_path or SAMPLE_VIDEO
        self.download_error = download_error
        self.downloaded_keys: list[str] = []
        self.uploaded: list[tuple[str, str]] = []  # (source_path, object_key)

    def download_to(self, object_key: str, dest_path: str) -> None:
        if self.download_error is not None:
            raise self.download_error
        self.downloaded_keys.append(object_key)
        shutil.copy(self.source_path, dest_path)

    def upload_from(self, source_path: str, object_key: str) -> None:
        self.uploaded.append((source_path, object_key))


class FakeDetectorAdapter:
    """Deterministic stand-in for `OnnxDetectorAdapter` — this sandbox
    never runs a real `.onnx` model, and the synthetic fixture's flat-
    color frames wouldn't yield meaningful detections from a real COCO
    model anyway. Returns the same scripted list of `Detection` objects
    (no `trackId`, matching what a real adapter's `detect()` returns)
    on every call, so the same bounding box across all 12 frames
    exercises REQ-5.3/5.4 filtering and REQ-5.5 tracking (same box each
    frame -> IoU 1.0 -> the same track ID every frame) end-to-end.
    """

    def __init__(self, detections: list[Detection] | None = None) -> None:
        self._detections = detections if detections is not None else []
        self.call_count = 0

    def detect(self, frame: Any) -> list[Detection]:
        self.call_count += 1
        return list(self._detections)


PERSON_DETECTION = Detection(
    label="person",
    confidence=0.9,
    boundingBox=BoundingBox(x=5, y=5, width=10, height=10),
)


async def test_publishes_started_detections_then_completed() -> None:
    pool = FakePool()
    producer = FakeProducer()
    minio_client = FakeMinioClient()
    detector = FakeDetectorAdapter(detections=[PERSON_DETECTION])

    await handle_command_message(envelope_bytes(), pool, producer, minio_client, detector)

    assert minio_client.downloaded_keys == ["missions/mission-1/source.mp4"]
    # REQ-4.2/4.12: fixture has 12 frames, the fake detector is called
    # once per frame.
    assert detector.call_count == 12

    topics = [entry[0] for entry in producer.sent]
    assert topics[0] == Topics.PROCESSING_EVENTS  # STARTED
    assert topics[-1] == Topics.PROCESSING_EVENTS  # COMPLETED
    # REQ-5.6: one DETECTION_PUBLISHED per frame (same detection
    # returned every frame, above the default confidence threshold and
    # inside the allow-list).
    assert topics[1:-1] == [Topics.DETECTIONS] * 12

    started_payload = producer.sent[0][1]["payload"]
    assert started_payload["missionId"] == "mission-1"
    assert started_payload["fps"] == 4.0
    assert started_payload["frameCount"] == 12

    detection_envelopes = producer.sent[1:-1]
    track_ids = {entry[1]["payload"]["trackId"] for entry in detection_envelopes}
    # REQ-5.5: the same bounding box every frame -> one stable track ID
    # across all 12 detections.
    assert len(track_ids) == 1
    first_detection_payload = detection_envelopes[0][1]["payload"]
    assert first_detection_payload["label"] == "person"
    assert first_detection_payload["frameIndex"] == 0
    assert first_detection_payload["boundingBox"] == {
        "x": 5.0,
        "y": 5.0,
        "width": 10.0,
        "height": 10.0,
    }
    assert detection_envelopes[0][2] == "mission-1"  # mission ID partition key

    completed_payload = producer.sent[-1][1]["payload"]
    assert "Phase 5" in completed_payload["note"]
    assert completed_payload["frameCount"] == 12
    assert completed_payload["detectionCount"] == 12
    assert completed_payload["trackCount"] == 1
    assert completed_payload["annotatedVideoObjectKey"] == "missions/mission-1/annotated.mp4"
    assert producer.sent[0][2] == "mission-1"

    # REQ-5.7: the annotated video was uploaded to the expected key.
    assert minio_client.uploaded == [
        (minio_client.uploaded[0][0], "missions/mission-1/annotated.mp4")
    ]


async def test_zero_detections_still_completes_and_uploads_annotated_video() -> None:
    """NullDetectorAdapter is what production falls back to when
    VISION_SERVICE_DETECTION_MODEL_PATH is unset (detection.factory) —
    the pipeline must still run end-to-end, publishing zero
    DETECTION_PUBLISHED events but still completing successfully.
    """
    pool = FakePool()
    producer = FakeProducer()
    minio_client = FakeMinioClient()
    detector = NullDetectorAdapter()

    await handle_command_message(envelope_bytes(), pool, producer, minio_client, detector)

    topics = [entry[0] for entry in producer.sent]
    assert topics == [Topics.PROCESSING_EVENTS, Topics.PROCESSING_EVENTS]  # STARTED, COMPLETED

    completed_payload = producer.sent[-1][1]["payload"]
    assert completed_payload["detectionCount"] == 0
    assert completed_payload["trackCount"] == 0
    assert len(minio_client.uploaded) == 1


async def test_skips_a_duplicate_delivery() -> None:
    pool = FakePool(already_processed=True)
    producer = FakeProducer()
    minio_client = FakeMinioClient()
    detector = NullDetectorAdapter()

    await handle_command_message(envelope_bytes(), pool, producer, minio_client, detector)

    assert producer.sent == []
    assert minio_client.downloaded_keys == []


async def test_skips_an_unknown_event_type() -> None:
    pool = FakePool()
    producer = FakeProducer()
    minio_client = FakeMinioClient()
    detector = NullDetectorAdapter()

    await handle_command_message(
        envelope_bytes(eventType="SOMETHING_ELSE"), pool, producer, minio_client, detector
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
    detector = NullDetectorAdapter()

    await handle_command_message(envelope_bytes(), pool, producer, minio_client, detector)

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
    detector = NullDetectorAdapter()

    await handle_command_message(envelope_bytes(), pool, producer, minio_client, detector)

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
