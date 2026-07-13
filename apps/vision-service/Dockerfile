# Phase 1 shell image — builds and starts the FastAPI vision-service
# shell with /health, /ready and /version endpoints. See
# docs/mvp-plan/PRD-Phase-1.md.
FROM python:3.12-slim AS base

COPY --from=ghcr.io/astral-sh/uv:0.5.14 /uv /uvx /bin/

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1

COPY pyproject.toml uv.lock* README.md ./
RUN uv sync --frozen --no-dev --no-install-project

COPY src ./src
RUN uv sync --frozen --no-dev

EXPOSE 8000
CMD ["uv", "run", "uvicorn", "vision_service.main:app", "--host", "0.0.0.0", "--port", "8000"]
