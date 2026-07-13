---
title: "ADR-002: Python dependency manager — uv"
type: adr
tags: [adr, python, phase1]
status: accepted
---

# ADR-002: Python dependency manager — uv

- Status: Accepted
- Date: 2026-07-13
- Decision owners: Dmytro
- Related documents: [[PRD-Phase-1]], [[Coding_Standards]]

## Context

`apps/vision-service` (REQ-1.5) is a Python + FastAPI shell today and
becomes the OpenCV/YOLO/ONNX Runtime vision worker from Phase 4 onward.
REQ-1.13 requires a `pyproject.toml`-based dependency manager selected
via ADR. REQ-1.14 requires Ruff for lint/format and pytest, runnable
with zero tests passing trivially. REQ-1.15 pins Python 3.12+ per
`Coding_Standards.md`.

The vision-service will eventually carry heavier, environment-sensitive
dependencies (OpenCV, ONNX Runtime, optionally CUDA/TensorRT-adjacent
packages per `Technology_Decisions.md`), so reproducible, fast installs
and lockfile-based determinism matter more here than for a typical thin
service.

## Decision

Use **uv** as the dependency manager and Python version manager for
`apps/vision-service`.

- `pyproject.toml` declares project metadata, `requires-python = ">=3.12"`,
  and dependencies under `[project.dependencies]` /
  `[dependency-groups]` (dev group: ruff, pytest, httpx for FastAPI
  TestClient).
- `uv.lock` is committed for reproducible installs.
- `uv run` is the standard entrypoint for local commands (`uv run pytest`,
  `uv run ruff check`, `uv run fastapi dev`), and CI uses `uv sync` +
  `uv run` rather than activating a venv manually.
- `uv python pin 3.12` pins the interpreter version used by `uv` for
  this project, satisfying REQ-1.15 independently of whatever Python
  version is present on a given machine.

## Alternatives considered

### Alternative A — Poetry

Poetry is mature, widely adopted, and has a similar `pyproject.toml` +
lockfile model. Rejected as the primary choice because it is
meaningfully slower for install/resolve than uv (relevant once OpenCV/
ONNX Runtime/model dependencies land in Phase 4–5), and it does not
manage the Python interpreter version itself the way `uv python pin`
does — that would require a separate tool (pyenv) to satisfy REQ-1.15
cleanly.

## Consequences

### Positive

- Single tool handles interpreter pinning, dependency resolution,
  virtual environments, and script running — fewer moving parts in CI
  and local dev than Poetry + pyenv.
- Fast resolve/install keeps CI's Python job comparably fast to the Nx
  TS pipeline (ADR-001), avoiding an imbalance where Python becomes the
  slow leg of every PR.
- `uv.lock` gives the same reproducibility guarantee Poetry's
  `poetry.lock` would.

### Negative

- uv is newer than Poetry; smaller (but rapidly growing) community and
  fewer Stack Overflow answers for edge cases.
- Some third-party tooling/tutorials assume Poetry; onboarding docs need
  to be explicit about uv usage.

### Risks

- uv's CLI and lockfile format are still evolving faster than Poetry's.
  Mitigation: pin the uv version used in CI (via the CI image / a
  documented `uv --version` in `CONTRIBUTING.md`) so upgrades are
  deliberate, not silent.

## Migration and rollback

`pyproject.toml`'s `[project]` metadata is tool-agnostic; migrating to
Poetry later would mean regenerating `poetry.lock` from the existing
`pyproject.toml` dependency list and dropping `uv.lock` — a mechanical,
low-risk change if it ever becomes necessary.

## Review date

Revisit at the start of Phase 4, when OpenCV/ONNX Runtime dependencies
land and uv's resolver gets exercised under real dependency weight.

---

## Related Notes

- [[PRD-Phase-1]] — REQ-1.13/1.14/1.15 require this decision.
- [[ADR-001-monorepo-tooling]] — the TS-side counterpart; Python is
  deliberately kept outside that Nx graph.
- [[Technology_Decisions]] — Python + FastAPI, OpenCV, YOLO, ONNX
  Runtime rationale this dependency manager will need to support from
  Phase 4 onward.
