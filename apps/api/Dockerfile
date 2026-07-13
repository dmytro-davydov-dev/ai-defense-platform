# Phase 1 shell image — builds and starts the NestJS control-plane API
# with /health and /ready endpoints. See docs/mvp-plan/PRD-Phase-1.md.
FROM node:20-slim AS build
WORKDIR /workspace

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* .npmrc ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
RUN pnpm install --frozen-lockfile --filter @ai-defense/api...

WORKDIR /workspace/apps/api
RUN pnpm build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /workspace/apps/api/dist ./dist
COPY --from=build /workspace/apps/api/package.json ./package.json
COPY --from=build /workspace/node_modules ./node_modules

EXPOSE 3000
CMD ["node", "dist/main.js"]
