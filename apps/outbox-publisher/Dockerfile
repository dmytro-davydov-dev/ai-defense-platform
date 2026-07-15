# syntax=docker/dockerfile:1.7
# Transactional Outbox publisher — PRD-Phase-3 REQ-3.7. Node 22+ to match
# the rest of the monorepo (see docs/roadmap/Progress.md Known gaps for
# why apps/api needs 22+; this app has no such dependency itself but
# stays on the same version for one less thing to vary across images).
FROM node:22-slim AS build
WORKDIR /workspace

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* .npmrc ./
COPY packages ./packages
COPY apps/outbox-publisher ./apps/outbox-publisher
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
# See apps/api/Dockerfile's comment on this same cache mount — building
# all four images concurrently with no shared pnpm store between them is
# what silently killed installs mid-download on the first full-stack
# build attempt (no pnpm error text, just an exit code after downloads
# stalled — an OOM-kill signature, not a lockfile/registry error).
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @ai-defense/outbox-publisher...

# @ai-defense/event-schemas and @ai-defense/observability are
# workspace:* dependencies — always symlinked into
# apps/outbox-publisher/node_modules (workspace-protocol deps are never
# hoisted like registry packages), and `pnpm build` below only compiles
# this app's own src/, not these. Build them explicitly so the runtime
# stage has real, fresh compiled dist/ to copy in — see
# docs/roadmap/Progress.md Known gaps for how this was caught (the
# first real `docker compose up --build` outside the authoring sandbox).
RUN pnpm --filter @ai-defense/event-schemas --filter @ai-defense/observability run build

WORKDIR /workspace/apps/outbox-publisher
RUN pnpm build

FROM node:22-slim AS runtime
# Kept as /workspace/apps/outbox-publisher (not flattened to /app) so
# every relative symlink pnpm created at build time still resolves
# identically at runtime — see apps/api/Dockerfile's comment for the
# full reasoning (an earlier attempt merging two node_modules copies
# onto a flattened /app/node_modules hit a BuildKit "cannot replace to
# directory ... with file" error; preserving the original tree depth
# instead avoids it).
WORKDIR /workspace/apps/outbox-publisher
ENV NODE_ENV=production

COPY --from=build /workspace/node_modules /workspace/node_modules
COPY --from=build /workspace/packages /workspace/packages
COPY --from=build /workspace/apps/outbox-publisher/node_modules ./node_modules
COPY --from=build /workspace/apps/outbox-publisher/dist ./dist
COPY --from=build /workspace/apps/outbox-publisher/package.json ./package.json

# No HTTP server — this is a poll loop, not a request-serving app, so
# there's nothing to EXPOSE and no /health endpoint (unlike web/api/
# vision-service). Compose has no healthcheck for this service either;
# see docker-compose.yml's comment on the outbox-publisher service.
CMD ["node", "dist/main.js"]
