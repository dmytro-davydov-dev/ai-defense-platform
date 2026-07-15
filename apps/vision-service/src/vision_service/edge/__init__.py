"""Phase 9 (docs/mvp-plan/PRD-Phase-9.md): the edge inference sidecar
`apps/edge-agent` (a TypeScript/Node process) spawns and supervises. See
docs/adr/ADR-010-edge-runtime-language-and-inference-strategy.md for why
local inference stays in Python rather than being reimplemented in
Node.
"""

from __future__ import annotations
