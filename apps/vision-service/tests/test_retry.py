"""REQ-3.9: bounded retry with exponential backoff."""

from __future__ import annotations

from vision_service.kafka.retry import with_bounded_retry


async def test_returns_true_on_first_successful_attempt() -> None:
    calls: list[int] = []

    async def fn() -> None:
        calls.append(1)

    failures: list[tuple[int, Exception]] = []
    result = await with_bounded_retry(
        fn,
        attempts=3,
        base_delay_seconds=0.001,
        on_attempt_failed=lambda attempt, error: failures.append((attempt, error)),
    )

    assert result is True
    assert len(calls) == 1
    assert failures == []


async def test_retries_up_to_attempt_count_then_reports_failure() -> None:
    calls: list[int] = []

    async def fn() -> None:
        calls.append(1)
        raise RuntimeError("boom")

    failures: list[tuple[int, Exception]] = []
    result = await with_bounded_retry(
        fn,
        attempts=3,
        base_delay_seconds=0.001,
        on_attempt_failed=lambda attempt, error: failures.append((attempt, error)),
    )

    assert result is False
    assert len(calls) == 3
    assert len(failures) == 3
    assert failures[0][0] == 1
    assert failures[2][0] == 3


async def test_succeeds_on_a_later_attempt() -> None:
    calls: list[int] = []

    async def fn() -> None:
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("first fails")

    result = await with_bounded_retry(
        fn, attempts=3, base_delay_seconds=0.001, on_attempt_failed=lambda *_: None
    )

    assert result is True
    assert len(calls) == 2
