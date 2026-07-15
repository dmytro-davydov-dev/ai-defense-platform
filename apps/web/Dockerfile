# syntax=docker/dockerfile:1.7
# Phase 1 shell image — builds and serves the static SPA with /health
# and /ready endpoints (server.js). See docs/mvp-plan/PRD-Phase-1.md.
# Node 22+ to match the root package.json's engines field and the rest
# of the monorepo's images (apps/api, apps/outbox-publisher) — pnpm
# enforces this via ERR_PNPM_UNSUPPORTED_ENGINE on node:20, which is
# exactly how this was caught (this Dockerfile predates Phase 6's
# engines bump and was missed until a real `docker compose up --build`
# ran outside the sandbox — see docs/roadmap/Progress.md Known gaps).
FROM node:22-slim AS build
WORKDIR /workspace

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* .npmrc ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
# See apps/api/Dockerfile's comment on this same cache mount — building
# all four images concurrently with no shared pnpm store between them is
# what silently killed installs mid-download on the first full-stack
# build attempt (no pnpm error text, just an exit code after downloads
# stalled — an OOM-kill signature, not a lockfile/registry error).
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @ai-defense/web...

WORKDIR /workspace/apps/web
RUN pnpm build

FROM node:22-slim AS runtime
# Kept as /workspace/apps/web (not flattened to /app) so every relative
# symlink pnpm created at build time still resolves identically at
# runtime — see apps/api/Dockerfile's comment for the full reasoning.
# Concretely here: apps/api's @nestjs/platform-express pulls in
# express@5.x, which wins the single root node_modules/express slot
# under this repo's hoisted linker (.npmrc). apps/web needs
# express@^4.21.2 (server.js's `app.get("*", ...)` SPA-fallback route
# uses Express 4's path-to-regexp syntax — Express 5 throws `PathError:
# Missing parameter name` on a bare "*"). pnpm resolves that conflict by
# nesting a real, correctly-versioned express under apps/web/node_modules
# specifically; preserving the original tree depth (rather than merging
# it onto a flattened /app/node_modules, which BuildKit rejected with
# "cannot replace to directory ... with file") is what makes both that
# nested copy and apps/web/node_modules's own symlinks up into
# node_modules/.pnpm resolve correctly — see docs/roadmap/Progress.md
# Known gaps.
WORKDIR /workspace/apps/web
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=build /workspace/node_modules /workspace/node_modules
COPY --from=build /workspace/apps/web/node_modules ./node_modules
COPY --from=build /workspace/apps/web/dist ./dist
COPY --from=build /workspace/apps/web/server.js ./server.js
COPY --from=build /workspace/apps/web/package.json ./package.json

EXPOSE 8080
CMD ["node", "server.js"]
