"""REQ-3.8: idempotent consumption via the `processed_events` table.

apps/vision-service is the only Python service with direct Postgres
access, deliberately scoped to exactly this one table — see
docs/python/Vision_Service_Shell.md for why this is a narrow, explicit
exception rather than this service gaining general database access.
"""

from __future__ import annotations

import uuid
from typing import Protocol


class FetchrowExecutor(Protocol):
    async def fetchrow(self, query: str, *args: object) -> object | None: ...


async def mark_processed(pool: FetchrowExecutor, event_id: str, consumer: str) -> bool:
    """Returns True if this call recorded `event_id` for `consumer` for
    the first time, False if it was already processed.
    """
    result = await pool.fetchrow(
        """
        INSERT INTO processed_events (id, event_id, consumer, processed_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (event_id, consumer) DO NOTHING
        RETURNING id
        """,
        str(uuid.uuid4()),
        event_id,
        consumer,
    )
    return result is not None
