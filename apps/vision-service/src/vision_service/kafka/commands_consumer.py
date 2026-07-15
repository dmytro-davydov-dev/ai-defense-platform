"""Consumes MISSION_PROCESSING_REQUESTED from `aidefense.commands` and
publishes PROCESSING_STARTED/PROCESSING_COMPLETED (or PROCESSING_FAILED)
to `aidefense.processing-events`, plus (Phase 5) one DETECTION_PUBLISHED
per retained detection to `aidefense.detections`.

Phase 3 (REQ-3.13) shipped this as a stub — no video download or frame
iteration, immediate STARTED -> COMPLETED. Phase 4 (PRD-Phase-4.md,
REQ-4.10/4.11) replaced the stub body with real work: download the
mission's video from MinIO, extract metadata (REQ-4.6), iterate every
frame (REQ-4.2) — still no detection model. Phase 5
(docs/mvp-plan/PRD-Phase-5.md, REQ-5.9/5.10) replaces Phase 4's
counting-only frame loop with `detection.pipeline.run_detection_pipeline`:
real detection (REQ-5.2), confidence/class-allow-list filtering
(REQ-5.3/5.4), tracking (REQ-5.5), annotation, and an annotated-video
upload to MinIO (REQ-5.7). A download, decode, model-load, or inference
failure publishes PROCESSING_FAILED (in addition to the existing
dead-letter publish) so `apps/api`'s `processing-events.handler.ts` can
transition the mission to FAILED.

`handle_command_message` stays the testable core (idempotency, retry,
DLQ, MinIO download/upload, the detection pipeline); `runner.py` wires
it to a real aiokafka Consumer/Producer, asyncpg pool, MinIO client, and
detector adapter.
"""

from __future__ import annotations

import asyncio
import json
import os
import tempfile
import time
from pathlib import Path
from typing import Any, Protocol

from vision_service.detection.adapter import DetectorAdapterLike
from vision_service.detection.onnx_detector import ModelInferenceError, ModelLoadError
from vision_service.detection.pipeline import (
    DetectionEvent,
    DetectionPipelineError,
    DetectionPipelineResult,
    run_detection_pipeline,
)
from vision_service.events.envelope import create_envelope
from vision_service.events.payloads import (
    EVENT_TYPES,
    DetectionBoundingBox,
    DetectionPublishedPayload,
    ProcessingCompletedPayload,
    ProcessingFailedPayload,
    ProcessingStartedPayload,
)
from vision_service.events.topics import Topics
from vision_service.metadata.extract import MetadataExtractionError, extract_video_metadata
from vision_service.observability import log
from vision_service.video.reader import VideoOpenError

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
    def upload_from(self, source_path: str, object_key: str) -> None: ...


async def _publish(producer: ProducerLike, topic: str, envelope: dict[str, Any], key: str) -> None:
    await producer.send_and_wait(
        topic,
        value=json.dumps(envelope).encode("utf-8"),
        key=key.encode("utf-8"),
    )


def _annotated_object_key(mission_id: str) -> str:
    return f"missions/{mission_id}/annotated.mp4"


def _detection_envelope(
    event: DetectionEvent,
    mission_id: str,
    correlation_id: str | None,
    causation_id: str | None,
) -> dict[str, Any]:
    return create_envelope(
        event_type=EVENT_TYPES["DETECTION_PUBLISHED"],
        event_version=1,
        producer="vision-service",
        payload=DetectionPublishedPayload(
            missionId=mission_id,
            frameIndex=event.frame_index,
            frameTimestampMs=event.frame_timestamp_ms,
            trackId=event.track_id,
            label=event.label,
            confidence=event.confidence,
            boundingBox=DetectionBoundingBox(
                x=event.bounding_box.x,
                y=event.bounding_box.y,
                width=event.bounding_box.width,
                height=event.bounding_box.height,
            ),
        ),
        correlation_id=correlation_id,
        causation_id=causation_id,
    ).model_dump()


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
    if isinstance(error, ModelLoadError):
        return f"MODEL_LOAD_FAILED: {error}"
    if isinstance(error, ModelInferenceError):
        return f"MODEL_INFERENCE_FAILED: {error}"
    if isinstance(error, DetectionPipelineError):
        return f"DETECTION_PIPELINE_FAILED: {error}"
    return f"{type(error).__name__}: {error}"


async def handle_command_message(
    raw_value: bytes,
    pool: FetchrowExecutor,
    producer: ProducerLike,
    minio_client: MinioClientLike,
    detector: DetectorAdapterLike,
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

            # REQ-5.9: detect -> filter -> track -> annotate, replacing
            # Phase 4's counting-only iteration. CPU-bound end to end
            # (OpenCV + ONNX Runtime), run as one blocking call.
            pipeline_result: DetectionPipelineResult = await asyncio.to_thread(
                run_detection_pipeline,
                tmp_path,
                detector=detector,
                fps=metadata.fps,
                frame_width=metadata.width,
                frame_height=metadata.height,
            )
            log(
                "info",
                "vision pipeline: frame iteration complete",
                framesIterated=pipeline_result.frame_count,
                missionId=mission_id,
                **log_context,
            )

            # REQ-5.8: inference metrics, one summary line per mission
            # (not one line per frame, to keep log volume bounded on
            # long videos) — average/total latency and derived
            # throughput.
            throughput_fps = (
                pipeline_result.frame_count / (pipeline_result.inference_duration_ms_total / 1000)
                if pipeline_result.inference_duration_ms_total > 0
                else None
            )
            log(
                "info",
                "vision pipeline: detection inference metrics",
                frameCount=pipeline_result.frame_count,
                detectionCount=len(pipeline_result.detection_events),
                trackCount=pipeline_result.track_count,
                inferenceDurationMsTotal=round(pipeline_result.inference_duration_ms_total, 1),
                inferenceDurationMsAvg=round(pipeline_result.inference_duration_ms_avg, 2),
                throughputFramesPerSecond=(
                    round(throughput_fps, 2) if throughput_fps is not None else None
                ),
                missionId=mission_id,
                **log_context,
            )

            # REQ-5.6: one DETECTION_PUBLISHED per retained detection,
            # in frame order, before PROCESSING_COMPLETED.
            for detection_event in pipeline_result.detection_events:
                await _publish(
                    producer,
                    Topics.DETECTIONS,
                    _detection_envelope(detection_event, mission_id, correlation_id, causation_id),
                    mission_id,
                )

            # REQ-5.7: annotated output video uploaded to MinIO.
            annotated_object_key = _annotated_object_key(mission_id)
            annotated_path = pipeline_result.annotated_video_path
            try:
                if annotated_path is not None:
                    await asyncio.to_thread(
                        minio_client.upload_from, str(annotated_path), annotated_object_key
                    )
            finally:
                if annotated_path is not None:
                    annotated_path.unlink(missing_ok=True)

            completed = create_envelope(
                event_type=EVENT_TYPES["PROCESSING_COMPLETED"],
                event_version=1,
                producer="vision-service",
                payload=ProcessingCompletedPayload(
                    missionId=mission_id,
                    note="Phase 5: detection and tracking complete",
                    frameCount=pipeline_result.frame_count,
                    processingDurationMs=pipeline_result.inference_duration_ms_total,
                    detectionCount=len(pipeline_result.detection_events),
                    trackCount=pipeline_result.track_count,
                    annotatedVideoObjectKey=annotated_object_key,
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

    # REQ-4.11/5.10: an unrecoverable download/decode/model/inference
    # failure publishes PROCESSING_FAILED with a structured reason —
    # apps/api's processing-events.handler.ts maps this to Mission
    # FAILED. Reuses REQ-3.9/3.10's retry/DLQ machinery rather than
    # introducing a new failure path: the DLQ publish below is
    # unchanged in kind, just given the same structured reason instead
    # of a fixed stub string.
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
