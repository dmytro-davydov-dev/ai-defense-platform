"""Structured logging — Python mirror of packages/observability's
`log()`/`CORRELATION_ID_HEADER`. Arrives in Phase 3, ahead of
docs/observability/Observability_Baseline.md's original Phase-4
estimate, because REQ-3.11 requires every Kafka consumer's log lines to
carry `correlationId` from day one.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from typing import Any

LogLevel = str
"""One of "debug", "info", "warn", "error" — not a Literal so callers
can pass a plain string without importing this module just for the
type.
"""


def log(level: LogLevel, message: str, **fields: Any) -> None:
    """Minimal structured JSON logger — one JSON object per line, same
    stable shape as packages/observability's `log()`.
    """
    record = {
        "level": level,
        "message": message,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **fields,
    }
    line = json.dumps(record)
    stream = sys.stderr if level in ("warn", "error") else sys.stdout
    print(line, file=stream)


CORRELATION_ID_HEADER = "x-correlation-id"
