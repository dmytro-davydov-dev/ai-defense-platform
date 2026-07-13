---
title: Vision Service Shell
type: python
tags: [python, phase1]
status: accepted
---

# Vision Service Shell

`apps/vision-service` — Phase 1 scaffold only
(`docs/mvp-plan/PRD-Phase-1.md`, REQ-1.5, REQ-1.13-1.15). OpenCV frame
handling lands in Phase 4; YOLO/ONNX Runtime detection and tracking land
in Phase 5 (`docs/mvp-plan/MVP_Implementation_Plan.md`).

## What exists today

- `src/vision_service/` — typed Python package, `src` layout (the same
  layout Phase 4's step 1 calls for, adopted early rather than
  restructured later).
- FastAPI app (`main.py`) with `/health`, `/ready`, `/version`
  (`routes/health.py`) — `/ready` always reports ready today since the
  shell has no dependencies; it will check Kafka consumer connectivity
  and MinIO once Phase 4 wires them in.
- `settings.py`: `pydantic-settings`-based config sourced from
  `VISION_SERVICE_*` environment variables / `.env` — no hardcoded
  config (REQ-1.18).
- Dependency management via **uv** (see [[ADR-002-python-dependency-manager]]),
  `pyproject.toml` pinning `requires-python = ">=3.12"`.
- Ruff configured for lint + format (`select = [E, F, I, UP, B, N, SIM]`).
- pytest + FastAPI `TestClient`: three trivial tests covering `/health`,
  `/ready`, `/version` (REQ-1.14).

## Known gap: `uv.lock` not yet committed

`uv.lock` could not be generated during Phase 1 implementation because
the sandbox environment used couldn't reach GitHub's release CDN (where
`uv` downloads its managed Python 3.12 build). Run `uv sync` once from a
machine with normal network access (or let CI's `astral-sh/setup-uv`
step do it) to generate and commit the lockfile before Phase 4 adds real
dependencies.

## What's deliberately not here yet

- No OpenCV, no video/frame handling, no model inference.
- No Kafka consumer — `MISSION_PROCESSING_REQUESTED` handling is
  Phase 4's step 8.

------------------------------------------------------------------------

## Related Notes

- [[PRD-Phase-1]] — REQ-1.5, REQ-1.13, REQ-1.14, REQ-1.15.
- [[ADR-002-python-dependency-manager]] — why uv, and its Phase 1
  limitation above.
- [[MVP_Implementation_Plan]] — Phase 4 (Python and OpenCV Foundation),
  Phase 5 (AI Detection and Tracking).
- [[Architecture_Overview]] — the Python Vision Worker container this
  app implements.
