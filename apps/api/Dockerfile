# syntax=docker/dockerfile:1.7
# Phase 1 shell image — builds and starts the NestJS control-plane API
# with /health and /ready endpoints. See docs/mvp-plan/PRD-Phase-1.md.
# Node 22+ is required (not just Phase 1's Node 20): the generated
# Prisma client (REQ-2.1, apps/api/generated/, gitignored) emits an
# `import.meta.url`-based __dirname shim that only resolves correctly
# under Node's newer ESM-in-CJS auto-detection — see
# docs/roadmap/Progress.md Known gaps.
FROM node:22-slim AS build
WORKDIR /workspace

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* .npmrc ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
# `docker compose ... up --build` builds all four Node/Python images
# concurrently, each running its own `pnpm install` against ~1,300+
# packages with no shared store between them — on a resource-constrained
# Docker Desktop VM this reliably killed the install mid-download with
# no pnpm-level error text at all (just "exit code: 1" after downloads
# stalled around 99% complete — a classic OOM-kill signature, not a
# lockfile/registry error). Mounting a persistent, shared pnpm content
# store across builds means only the first build actually downloads
# anything; every build after (including re-runs of this same service)
# reuses it instead of re-fetching ~1,300 packages from scratch each
# time — see docs/roadmap/Progress.md Known gaps.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @ai-defense/api...

# @ai-defense/event-schemas and @ai-defense/observability are
# workspace:* dependencies — always symlinked into
# apps/api/node_modules (workspace-protocol deps are never hoisted like
# registry packages, regardless of .npmrc's node-linker setting), and
# `nest build` below only compiles apps/api's own src/, not these. Build
# them explicitly so the runtime stage has real, fresh compiled dist/ to
# copy in — see docs/roadmap/Progress.md Known gaps for how this was
# caught (the first real `docker compose up --build` outside the
# authoring sandbox).
RUN pnpm --filter @ai-defense/event-schemas --filter @ai-defense/observability run build

WORKDIR /workspace/apps/api
# REQ-2.1/2.3: generates apps/api/generated/prisma/ from schema.prisma —
# gitignored, so it must be regenerated on every build. Needs network
# access to binaries.prisma.sh, available on CI/normal build hosts (see
# docs/roadmap/Progress.md Known gaps for the sandbox that authored this
# Dockerfile not having that access itself).
RUN pnpm exec prisma generate
RUN pnpm build

FROM node:22-slim AS runtime
# Kept as /workspace/apps/api (not flattened to /app) so every relative
# symlink pnpm created at build time still resolves identically at
# runtime: apps/api/node_modules/@ai-defense/observability points at
# ../../../../packages/observability, and apps/api/node_modules's own
# non-workspace symlinks point up into node_modules/.pnpm — both only
# work if the same directory depth from /workspace exists here too.
# (An earlier attempt merged apps/api/node_modules onto a flattened
# /app/node_modules — BuildKit refused with "cannot replace to
# directory ... with file" wherever a package was a real directory in
# one copy and a symlink in the other, e.g. @types/pg. Preserving the
# original tree instead of merging two copies onto the same path avoids
# that entirely — see docs/roadmap/Progress.md Known gaps.)
WORKDIR /workspace/apps/api
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /workspace/node_modules /workspace/node_modules
COPY --from=build /workspace/packages /workspace/packages
COPY --from=build /workspace/apps/api/node_modules ./node_modules
COPY --from=build /workspace/apps/api/dist ./dist
COPY --from=build /workspace/apps/api/package.json ./package.json

EXPOSE 3000
# Not "dist/main.js": apps/api/tsconfig.json sets rootDir to "./"
# (apps/api itself, not "src") so one tsc invocation also compiles the
# sibling prisma.config.ts and generated/prisma/ alongside src/ — every
# src/ file's output nests one level deeper as a result
# (dist/src/main.js, not dist/main.js). Confirmed broken as
# "dist/main.js" the first time this image was actually run — see
# docs/roadmap/Progress.md Known gaps.
CMD ["node", "dist/src/main.js"]
