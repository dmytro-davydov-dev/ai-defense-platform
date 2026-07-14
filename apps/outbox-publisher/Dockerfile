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
RUN pnpm install --frozen-lockfile --filter @ai-defense/outbox-publisher...

WORKDIR /workspace/apps/outbox-publisher
RUN pnpm build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /workspace/apps/outbox-publisher/dist ./dist
COPY --from=build /workspace/apps/outbox-publisher/package.json ./package.json
COPY --from=build /workspace/node_modules ./node_modules

# No HTTP server — this is a poll loop, not a request-serving app, so
# there's nothing to EXPOSE and no /health endpoint (unlike web/api/
# vision-service). Compose has no healthcheck for this service either;
# see docker-compose.yml's comment on the outbox-publisher service.
CMD ["node", "dist/main.js"]
