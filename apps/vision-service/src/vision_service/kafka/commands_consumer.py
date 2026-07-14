"""Consumes MISSION_PROCESSING_REQUESTED from `aidefense.commands` and
publishes PROCESSING_STARTED/PROCESSING_COMPLETED (or PROCESSING_FAILED)
to `aidefense.processing-events`.

Phase 3 (REQ-3.13) shipped this as a stub — no video download or frame
iteration, immediate STARTED -> COMPLETED. Phase 4 (PRD-Phase-4.md,
REQ-4.10/4.11) replaces the stub body with real work: download the
mission's video from MinIO, extract metadata (REQ-4.6), iterate every
frame (REQ-4.2) — still no detection model, that's Phase 5 — and
publish events carrying the real frame count/duration. A download or
decode failure now also publishes PROCESSING_FAILED (in addition to the
existing dead-letter publish) so `apps/api`'s
`processing-events.handler.ts` can transition the mission to FAILED,
which the Phase 3 stub never triggered since it could never actually
fail.

`handle_command_message` stays the testable core (idempotency, retry,
DLQ, MinIO download, frame iteration); `runner.py` wires it to a real
aiokafka Consumer/Producer, asyncpg pool, and MinIO client.
"""

from __future__ import annotations

import asyncio
import json
import os
import tempfile
import time
from pathlib import Path
from typing import Any, Protocol

from vision_service.events.envelope import create_envelope
from vision_service.events.payloads import (
    EVENT_TYPES,
    ProcessingCompletedPayload,
    ProcessingFailedPayload,
    ProcessingStartedPayload,
)
from vision_service.events.topics import Topics
from vision_service.metadata.extract import MetadataExtractionError, extract_video_metadata
from vision_service.observability import log
from vision_service.video.reader import VideoOpenError, VideoReader

from .dead_letter import build_dead_letter_envelope
from .idempotency import FetchrowExecutor, mark_processed
from .retry import with_bounded_retry

CONSUMER_NAME = "vision-service"
RETRY_ATTEMPTS = 3
RETRY_BASE_DELAY_SECONDS = 0.2


class ProducerLike(Protocol):
    async def send_and_wait(self, topic: str, value: bytes, key: bytes) -> object: ...


class MinioClientLike(Protocol):
    def download_to(self, object_key: str, dest_path: str) -> None: ...


async def _publish(producer: ProducerLike, topic: str, envelope: dict[str, Any], key: str) -> None:
    await producer.send_and_wait(
        topic,
        value=json.dumps(envelope).encode("utf-8"),
        key=key.encode("utf-8"),
    )


def _count_frames(path: Path) -> int:
    """REQ-4.2: proves every frame decodes by iterating
    `VideoReader.frames()`'s generator one frame at a time — never
    buffers more than one frame in memory. Still no model inference
    (Phase 5); this only counts.
    """
    count = 0
    with VideoReader(path) as reader:
        for _ in reader.frames():
            count += 1
    return count


def _structured_failure_reason(error: Exception | None) -> str:
    """A stable, human-readable reason — never a stack trace, per
    `processing-failed.schema.json`'s field description.
    """
    if error is None:
        return "PROCESSING_FAILED_AFTER_RETRIES"
    if isinstance(error, VideoOpenError):
        return f"VIDEO_DECODE_FAILED: {error}"
    if isinstance(error, MetadataExtractionError):
        return f"METADATA_EXTRACTION_FAILED: {error}"
    return f"{type(error).__name__}: {error}"


async def handle_command_message(
    raw_value: bytes,
    pool: FetchrowExecutor,
    producer: ProducerLike,
    minio_client: MinioClientLike,
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
    video_object_key = envelope["payload"]["videoObjectKey"]
    correlation_id = envelope.get("correlationId")
    causation_id = envelope.get("eventId")

    last_error: Exception | None = None

    async def process() -> None:
        suffix = Path(video_object_key).suffix or ".mp4"
        fd, tmp_name = tempfile.mkstemp(suffix=suffix)
        os.close(fd)
        tmp_path = Path(tmp_name)
        try:
            download_start = time.monotonic()
            await asyncio.to_thread(minio_client.download_to, video_object_key, str(tmp_path))
            download_duration_ms = (time.monotonic() - download_start) * 1000
            log(
                "info",
                "vision pipeline: download complete",
                videoObjectKey=video_object_key,
                downloadDurationMs=round(download_duration_ms, 1),
                missionId=mission_id,
                **log_context,
            )

            # REQ-4.6: metadata extracted once, before frame iteration begins.
            metadata = await asyncio.to_thread(extract_video_metadata, tmp_path)
            log(
                "info",
                "vision pipeline: metadata extracted",
                frameCount=metadata.frameCount,
                fps=metadata.fps,
                durationSeconds=metadata.durationSeconds,
                checksumSha256=metadata.checksumSha256,
                missionId=mission_id,
                **log_context,
            )

            started = create_envelope(
                event_type=EVENT_TYPES["PROCESSING_STARTED"],
                event_version=1,
                producer="vision-service",
                payload=ProcessingStartedPayload(
                    missionId=mission_id,
                    durationSeconds=metadata.durationSeconds,
                    fps=metadata.fps,
                    width=metadata.width,
                    height=metadata.height,
                    frameCount=metadata.frameCount,
                    checksumSha256=metadata.checksumSha256,
                ),
                correlation_id=correlation_id,
                causation_id=causation_id,
            )
            await _publish(producer, Topics.PROCESSING_EVENTS, started.model_dump(), mission_id)

            # REQ-4.2/4.10: real, bounded-memory frame iteration — no
            # detection model yet (Phase 5).
            iteration_start = time.monotonic()
            frame_count = await asyncio.to_thread(_count_frames, tmp_path)
            processing_duration_ms = (time.monotonic() - iteration_start) * 1000
            log(
                "info",
                "vision pipeline: frame iteration complete",
                framesIterated=frame_count,
                processingDurationMs=round(processing_duration_ms, 1),
                missionId=mission_id,
                **log_context,
            )

            completed = create_envelope(
                event_type=EVENT_TYPES["PROCESSING_COMPLETED"],
                event_version=1,
                producer="vision-service",
                payload=ProcessingCompletedPayload(
                    missionId=mission_id,
                    note="Phase 4: real frame iteration complete, no detection model yet",
                    frameCount=frame_count,
                    processingDurationMs=processing_duration_ms,
                ),
                correlation_id=correlation_id,
                causation_id=causation_id,
            )
            await _publish(producer, Topics.PROCESSING_EVENTS, completed.model_dump(), mission_id)
        finally:
            tmp_path.unlink(missing_ok=True)

    def on_attempt_failed(attempt: int, error: Exception) -> None:
        nonlocal last_error
        last_error = error
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
            "commands consumer: pipeline complete",
            missionId=mission_id,
            **log_context,
        )
        return

    # REQ-4.11: an unrecoverable download/decode failure publishes
    # PROCESSING_FAILED with a structured reason — apps/api's
    # processing-events.handler.ts maps this to Mission FAILED, which
    # the Phase 3 stub could never trigger. Reuses REQ-3.9/3.10's
    # retry/DLQ machinery rather than introducing a new failure path:
    # the DLQ publish below is unchanged in kind, just given the same
    # structured reason instead of a fixed stub string.
    reason = _structured_failure_reason(last_error)
    try:
        failed = create_envelope(
            event_type=EVENT_TYPES["PROCESSING_FAILED"],
            event_version=1,
            producer="vision-service",
            payload=ProcessingFailedPayload(missionId=mission_id, reason=reason),
            correlation_id=correlation_id,
            causation_id=causation_id,
        )
        await _publish(producer, Topics.PROCESSING_EVENTS, failed.model_dump(), mission_id)
    except Exception as publish_error:
        # The broker/topic that just failed 3x for the real pipeline is
        # the same one PROCESSING_FAILED would publish to — don't let a
        # failure to *announce* the failure crash the consumer loop;
        # the dead-letter publish below is the higher-priority delivery
        # (REQ-3.9/3.10 already exist and are relied on elsewhere).
        log(
            "error",
            "commands consumer: failed to publish PROCESSING_FAILED",
            error=str(publish_error),
            **log_context,
        )

    dlq_envelope = build_dead_letter_envelope(
        envelope,
        Topics.COMMANDS,
        reason,
        RETRY_ATTEMPTS,
        "vision-service",
    )
    await _publish(producer, Topics.DEAD_LETTER, dlq_envelope.model_dump(), mission_id)
    log(
        "error",
        "commands consumer: exhausted retries, dead-lettered",
        reason=reason,
        **log_context,
    )
