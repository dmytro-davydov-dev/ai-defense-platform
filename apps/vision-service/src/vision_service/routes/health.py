"""Liveness/readiness/version control endpoints.

Per docs/mvp-plan/PRD-Phase-1.md REQ-1.8. `/ready` reported "always
ready" through Phase 1/3 since the shell had no dependencies to check.
Phase 4 (PRD-Phase-4.md REQ-4.7) wires in real checks: the Kafka
consumer's connection status (`kafka.runner.commands_consumer_runner`)
and a lightweight MinIO reachability check
(`storage.minio_client.minio_client`). Either check is skipped (treated
as ready) if its dependency isn't configured at all — consistent with
the "disabled, not broken" treatment `kafka.runner`/`settings` already
give a blank KAFKA_BROKERS/DATABASE_URL/MINIO_ROOT_USER.
"""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Response, status

from vision_service import __version__
from vision_service.kafka.runner import commands_consumer_runner
from vision_service.settings import settings
from vision_service.storage.minio_client import minio_client

router = APIRouter(tags=["health"])


@router.get("/health")
def get_health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready")
async def get_ready(response: Response) -> dict[str, str]:
    kafka_ready = commands_consumer_runner.is_ready

    minio_configured = bool(settings.minio_root_user and settings.minio_root_password)
    # HeadBucket is a blocking boto3 call — run off the event loop
    # rather than stalling every other in-flight request.
    minio_ready = await asyncio.to_thread(minio_client.is_reachable) if minio_configured else True

    overall_ready = kafka_ready and minio_ready
    if not overall_ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "status": "ready" if overall_ready else "not_ready",
        "kafka": "ready" if kafka_ready else "not_ready",
        "minio": "ready" if minio_ready else "not_ready",
    }


@router.get("/version")
def get_version() -> dict[str, str]:
    return {"service": settings.service_name, "version": __version__}
