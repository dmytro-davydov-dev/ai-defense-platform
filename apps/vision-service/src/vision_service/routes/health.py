"""Liveness/readiness/version control endpoints.

Per docs/mvp-plan/PRD-Phase-1.md REQ-1.8 and
docs/mvp-plan/MVP_Implementation_Plan.md Phase 4 step 5. `/ready` will
start checking real dependencies (Kafka consumer connectivity, MinIO)
once Phase 4 wires them in; today it always reports ready since the
shell has no dependencies.
"""

from fastapi import APIRouter

from vision_service import __version__
from vision_service.settings import settings

router = APIRouter(tags=["health"])


@router.get("/health")
def get_health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready")
def get_ready() -> dict[str, str]:
    return {"status": "ready"}


@router.get("/version")
def get_version() -> dict[str, str]:
    return {"service": settings.service_name, "version": __version__}
