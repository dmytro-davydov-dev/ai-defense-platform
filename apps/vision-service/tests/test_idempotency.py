"""REQ-3.8: idempotent consumption via the processed_events table."""

from __future__ import annotations

from vision_service.kafka.idempotency import mark_processed


class FakePool:
    def __init__(self, already_processed: bool) -> None:
        self.already_processed = already_processed
        self.calls: list[tuple[str, ...]] = []

    async def fetchrow(self, query: str, *args: object) -> object | None:
        self.calls.append(args)
        return None if self.already_processed else {"id": args[0]}


async def test_records_a_new_event_and_returns_true() -> None:
    pool = FakePool(already_processed=False)

    result = await mark_processed(pool, "event-1", "vision-service")

    assert result is True
    assert pool.calls[0][1] == "event-1"
    assert pool.calls[0][2] == "vision-service"


async def test_returns_false_for_an_already_processed_event() -> None:
    pool = FakePool(already_processed=True)

    result = await mark_processed(pool, "event-1", "vision-service")

    assert result is False
