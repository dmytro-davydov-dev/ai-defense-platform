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
RUN pnpm install --frozen-lockfile --filter @ai-defense/api...

WORKDIR /workspace/apps/api
# REQ-2.1/2.3: generates apps/api/generated/prisma/ from schema.prisma —
# gitignored, so it must be regenerated on every build. Needs network
# access to binaries.prisma.sh, available on CI/normal build hosts (see
# docs/roadmap/Progress.md Known gaps for the sandbox that authored this
# Dockerfile not having that access itself).
RUN pnpm exec prisma generate
RUN pnpm build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /workspace/apps/api/dist ./dist
COPY --from=build /workspace/apps/api/package.json ./package.json
COPY --from=build /workspace/node_modules ./node_modules

EXPOSE 3000
CMD ["node", "dist/main.js"]
