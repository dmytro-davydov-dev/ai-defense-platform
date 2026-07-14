"""REQ-3.9: bounded retry with exponential backoff — Python mirror of
apps/api/src/kafka/retry.util.ts.
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable


async def with_bounded_retry(
    fn: Callable[[], Awaitable[None]],
    attempts: int,
    base_delay_seconds: float,
    on_attempt_failed: Callable[[int, Exception], None],
) -> bool:
    """Calls `fn` up to `attempts` times, backing off
    `base_delay_seconds * 2^(attempt-1)` between tries. Returns True the
    moment `fn` succeeds, False once every attempt has failed — never
    raises, so a consumer's message loop can't crash on one bad message.
    """
    for attempt in range(1, attempts + 1):
        try:
            await fn()
            return True
        except Exception as error:
            on_attempt_failed(attempt, error)
            if attempt < attempts:
                await asyncio.sleep(base_delay_seconds * (2 ** (attempt - 1)))
    return False
