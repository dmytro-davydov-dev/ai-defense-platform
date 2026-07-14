"""Wires `commands_consumer.handle_command_message` to a real aiokafka
`AIOKafkaConsumer`/`AIOKafkaProducer` and an `asyncpg` pool. Started/
stopped from `main.py`'s FastAPI lifespan. Kept out of
`commands_consumer.py` on purpose — that module has no dependency on
aiokafka/asyncpg's concrete types, only the narrow `Protocol`s it
declares, so it stays unit-testable without a broker/DB (REQ-3.13's
"stub" scope doesn't extend to skipping tests, per
Coding_Standards.md's "domain logic: unit tests").
"""

from __future__ import annotations

import asyncio

import asyncpg
from aiokafka import AIOKafkaConsumer, AIOKafkaProducer

from vision_service.events.topics import Topics
from vision_service.observability import log
from vision_service.settings import settings

from .commands_consumer import handle_command_message


class CommandsConsumerRunner:
    """Owns the consumer task's lifecycle. `settings.kafka_brokers`/
    `settings.database_url` being blank (e.g. running the FastAPI app
    standalone for a quick local check) disables the consumer with a
    loud log line rather than crashing the whole app — the HTTP
    surface (/health, /ready, /version) has no dependency on Kafka.
    """

    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None
        self._consumer: AIOKafkaConsumer | None = None
        self._producer: AIOKafkaProducer | None = None
        self._pool: asyncpg.Pool | None = None

    async def start(self) -> None:
        if not settings.kafka_brokers or not settings.database_url:
            log(
                "warn",
                "KAFKA_BROKERS/DATABASE_URL not set — commands consumer disabled",
            )
            return

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

        self._task = asyncio.create_task(self._run())
        log("info", "commands consumer started", topic=Topics.COMMANDS)

    async def _run(self) -> None:
        if self._consumer is None or self._producer is None or self._pool is None:
            return
        async for message in self._consumer:
            try:
                await handle_command_message(message.value, self._pool, self._producer)
            except Exception as error:
                # Last-resort guard: handle_command_message already
                # retries + dead-letters (REQ-3.9/3.10), so reaching
                # here means something outside that contract broke
                # (e.g. malformed JSON) — log and keep the loop alive
                # rather than let one bad message kill the consumer.
                log("error", "commands consumer: unhandled error", error=str(error))

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
        if self._consumer is not None:
            await self._consumer.stop()
        if self._producer is not None:
            await self._producer.stop()
        if self._pool is not None:
            await self._pool.close()
