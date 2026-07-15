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
RUN pnpm install --frozen-lockfile --filter @ai-defense/web...

WORKDIR /workspace/apps/web
RUN pnpm build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=build /workspace/apps/web/dist ./dist
COPY --from=build /workspace/apps/web/server.js ./server.js
COPY --from=build /workspace/apps/web/package.json ./package.json
COPY --from=build /workspace/node_modules ./node_modules

EXPOSE 8080
CMD ["node", "server.js"]
