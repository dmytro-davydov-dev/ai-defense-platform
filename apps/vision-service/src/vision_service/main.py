"""FastAPI application entrypoint.

Run locally with:
    uv run fastapi dev src/vision_service/main.py
"""

from fastapi import FastAPI

from vision_service.routes.health import router as health_router
from vision_service.settings import settings

app = FastAPI(title=settings.service_name)
app.include_router(health_router)
