"""FastAPI application entrypoint.

Run locally with:
    uv run fastapi dev src/vision_service/main.py
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from vision_service.kafka.runner import CommandsConsumerRunner
from vision_service.routes.health import router as health_router
from vision_service.settings import settings

# REQ-3.13: one instance for the process lifetime — started/stopped by
# the lifespan context below, not per-request.
commands_consumer_runner = CommandsConsumerRunner()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    await commands_consumer_runner.start()
    try:
        yield
    finally:
        await commands_consumer_runner.stop()


app = FastAPI(title=settings.service_name, lifespan=lifespan)
app.include_router(health_router)
