# Phase 1 shell image — builds and serves the static SPA with /health
# and /ready endpoints (server.js). See docs/mvp-plan/PRD-Phase-1.md.
FROM node:20-slim AS build
WORKDIR /workspace

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* .npmrc ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
RUN pnpm install --frozen-lockfile --filter @ai-defense/web...

WORKDIR /workspace/apps/web
RUN pnpm build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=build /workspace/apps/web/dist ./dist
COPY --from=build /workspace/apps/web/server.js ./server.js
COPY --from=build /workspace/apps/web/package.json ./package.json
COPY --from=build /workspace/node_modules ./node_modules

EXPOSE 8080
CMD ["node", "server.js"]
