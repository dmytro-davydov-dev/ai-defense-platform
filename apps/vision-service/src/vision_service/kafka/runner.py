"""Wires `commands_consumer.handle_command_message` to a real aiokafka
`AIOKafkaConsumer`/`AIOKafkaProducer`, an `asyncpg` pool, and (Phase 4,
REQ-4.10) `storage.minio_client`'s `MinioClient`. Started/stopped from
`main.py`'s FastAPI lifespan. Kept out of `commands_consumer.py` on
purpose — that module has no dependency on aiokafka/asyncpg/boto3's
concrete types, only the narrow `Protocol`s it declares, so it stays
unit-testable without a broker/DB/MinIO (REQ-3.13's "stub" scope
doesn't extend to skipping tests, per Coding_Standards.md's "domain
logic: unit tests").

`commands_consumer_runner` is a module-level singleton (not
instantiated in `main.py`) specifically so `routes/health.py` can
import the same instance for REQ-4.7's `/ready` check without a
circular import between `main` and `routes.health`.
"""

from __future__ import annotations

import asyncio

import asyncpg
from aiokafka import AIOKafkaConsumer, AIOKafkaProducer

from vision_service.events.topics import Topics
from vision_service.observability import log
from vision_service.settings import settings
from vision_service.storage.minio_client import minio_client

from .commands_consumer import handle_command_message


class CommandsConsumerRunner:
    """Owns the consumer task's lifecycle. `settings.kafka_brokers`/
    `settings.database_url` being blank (e.g. running the FastAPI app
    standalone for a quick local check) disables the consumer with a
    loud log line rather than crashing the whole app — the HTTP
    surface (/health, /ready, /version) has no hard dependency on
    Kafka.
    """

    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None
        self._consumer: AIOKafkaConsumer | None = None
        self._producer: AIOKafkaProducer | None = None
        self._pool: asyncpg.Pool | None = None
        # REQ-4.7: whether Kafka/DB are configured at all vs. actually
        # connected — `/ready` treats "not configured" (this attribute
        # False) as nothing-to-check, not as "not ready", the same way
        # the Phase 1 shell always reported ready with zero
        # dependencies.
        self._kafka_configured = False
        self._kafka_ready = False

    async def start(self) -> None:
        if not settings.kafka_brokers or not settings.database_url:
            log(
                "warn",
                "KAFKA_BROKERS/DATABASE_URL not set — commands consumer disabled",
            )
            return
        self._kafka_configured = True

        self._pool = await asyncpg.create_pool(dsn=settings.database_url)
        self._producer = AIOKafkaProducer(bootstrap_servers=settings.kafka_brokers)
        await self._producer.start()

        self._consumer = AIOKafkaConsumer(
            Topics.COMMANDS,
            bootstrap_servers=settings.kafka_brokers,
            group_id="vision-service-commands",
            enable_auto_commit=True,
        )
        await self._consumer.start()
        self._kafka_ready = True

        self._task = asyncio.create_task(self._run())
        log("info", "commands consumer started", topic=Topics.COMMANDS)

    async def _run(self) -> None:
        if self._consumer is None or self._producer is None or self._pool is None:
            return
        async for message in self._consumer:
            try:
                await handle_command_message(
                    message.value, self._pool, self._producer, minio_client
                )
            except Exception as error:
                # Last-resort guard: handle_command_message already
                # retries + dead-letters (REQ-3.9/3.10), so reaching
                # here means something outside that contract broke
                # (e.g. malformed JSON) — log and keep the loop alive
                # rather than let one bad message kill the consumer.
                log("error", "commands consumer: unhandled error", error=str(error))

    async def stop(self) -> None:
        self._kafka_ready = False
        if self._task is not None:
            self._task.cancel()
        if self._consumer is not None:
            await self._consumer.stop()
        if self._producer is not None:
            await self._producer.stop()
        if self._pool is not None:
            await self._pool.close()

    @property
    def is_ready(self) -> bool:
        """REQ-4.7: True if Kafka/DB were never configured (nothing to
        check) or if `start()` connected successfully and `stop()`
        hasn't run since. False the moment a configured consumer isn't
        actually connected — e.g. `start()` hasn't finished yet, or
        the broker/DB became unreachable after startup (this is a
        point-in-time flag set by `start()`/`stop()`, not a live
        per-request ping — deeper connection-health polling is Phase
        11's observability scope, not this phase's).
        """
        return (not self._kafka_configured) or self._kafka_ready


commands_consumer_runner = CommandsConsumerRunner()
