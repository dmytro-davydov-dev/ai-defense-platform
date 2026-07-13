# vision-service

Python + FastAPI vision worker. Phase 1 scaffold only — no OpenCV/model
inference yet (see `docs/mvp-plan/PRD-Phase-1.md`, REQ-1.5). The Kafka
consumer, frame pipeline and detection model land in Phases 4 and 5.

## Local development

```bash
uv sync
uv run fastapi dev src/vision_service/main.py
```

- `/health` — liveness probe, always 200 once the process is up.
- `/ready` — readiness probe (will check real dependencies from Phase 4
  onward).
- `/version` — service name/version metadata.

## Lint, format, test

```bash
uv run ruff check .
uv run ruff format .
uv run pytest
```
