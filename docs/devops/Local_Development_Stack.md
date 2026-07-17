---
title: Local Development Stack
type: devops
tags: [devops, infrastructure, ci, phase1]
status: accepted
---

# Local Development Stack

Phase 1's engineering foundation (`docs/mvp-plan/PRD-Phase-1.md`,
sections 5.5-5.7): Docker Compose for local infra, GitHub Actions for CI
quality gates, and the pre-commit/commit-message hooks that enforce them
before code reaches CI.

## Docker Compose

`infrastructure/compose/docker-compose.yml` (REQ-1.16/1.17) runs six
services: `postgres` (PostGIS 16), `redpanda` (Kafka API — see
[[ADR-003-kafka-distribution-local-compose]]), `minio`, and the three
app shells (`web`, `api`, `vision-service`), each with a healthcheck so
`docker compose up` reaches a fully healthy stack with no manual steps.
All configuration is environment-variable driven from `.env`
(`.env.example` is committed, documented, REQ-1.18) — nothing is
hardcoded.

Run it with:

```bash
docker compose --env-file .env -f infrastructure/compose/docker-compose.yml up --build
```

`infrastructure/postgres/init/001-enable-postgis.sql` explicitly enables
the PostGIS extension so a plain `postgres` image could be substituted
later without silently losing GIS support.

## Running `apps/api` outside Docker Compose

`docker-compose.yml` injects each service's `DATABASE_URL`/
`KAFKA_BROKERS`/`MINIO_ENDPOINT` etc. itself, resolved against
Docker-internal hostnames (`postgres`, `redpanda`, `minio`) via the root
`.env`'s `POSTGRES_*`/`MINIO_*` values (see the Docker Compose section
above). Those internal hostnames aren't resolvable from a plain host
shell, so running `apps/api` directly (`pnpm --filter @ai-defense/api
start:dev`, or any Prisma CLI command) needs its own env file with the
same values but `localhost`-pointed instead:

`apps/api/.env.local` — gitignored (`.gitignore`'s `.env.local`/
`.env.*.local` patterns), not committed, created by hand per developer
machine:

```dotenv
DATABASE_URL="postgresql://<POSTGRES_USER>:<POSTGRES_PASSWORD>@localhost:<POSTGRES_PORT>/<POSTGRES_DB>"
KAFKA_BROKERS="localhost:<REDPANDA_KAFKA_PORT>"
MINIO_ENDPOINT="localhost"
MINIO_PORT="<MINIO_PORT>"
MINIO_ROOT_USER="<MINIO_ROOT_USER>"
MINIO_ROOT_PASSWORD="<MINIO_ROOT_PASSWORD>"
JWT_SECRET="<JWT_SECRET>"
CORS_ORIGIN="http://localhost:<WEB_PORT>"
```

(Values should match the root `.env`'s `POSTGRES_*`/`MINIO_*`/etc.
entries — this file just re-points the hostnames at `localhost` since
Compose still needs to be up for the actual Postgres/Redpanda/MinIO
containers, only `apps/api` itself is running outside it.)

`apps/api/src/main.ts` loads this explicitly
(`config({ path: "./.env.local" })`, via the `dotenv` package) because
plain `import "dotenv/config"` only reads `.env` from `process.cwd()`,
never `.env.local`. `apps/api/prisma.config.ts` (the Prisma CLI's own
config, used by `prisma migrate`/`prisma generate`) does the same for
the same reason — until 2026-07-17 it didn't, which meant `prisma
migrate deploy`/`generate` run from a host shell failed with "The
datasource.url property is required in your Prisma config file" even
though the running app connected fine (see [[API_Shell]]'s Known gaps
for the fix). Currently only `apps/api` has this file — `apps/web`/
`apps/vision-service` don't need a host/container hostname split the
same way (Vite's env vars are baked in at build time; `vision-service`
isn't Dockerized as part of this split yet).

## CI — GitHub Actions

`.github/workflows/ci.yml` (REQ-1.19-1.21) runs on every PR:

- ~~**commitlint**~~ — removed (2026-07-14), see [[Progress]] Known
  gaps. Used to validate every commit in the PR against Conventional
  Commits.
- **ts-quality** — `nx affected` for `lint`, `typecheck`, `test`,
  `build`, plus `pnpm format:check`, scoped to only the TS
  apps/packages actually touched by the PR.
- **python-quality** — Ruff + pytest for `apps/vision-service`, run as a
  separate job since Python is deliberately kept outside the Nx graph
  (see [[ADR-001-monorepo-tooling]]).
- **docker-build** — a matrix build (`web`, `api`, `vision-service`)
  proving every shell's Dockerfile actually builds, without pushing
  anywhere.

All jobs must pass before merge (enforced via GitHub branch protection,
configured in repo settings — not itself a file in this repo).

## Pre-commit hooks

Husky (`.husky/pre-commit`, `.husky/commit-msg`, REQ-1.23) runs
`lint-staged` (Prettier on staged `apps/**`/`packages/**` TS/JSON files
and `infrastructure/**`/`.github/**` YAML — deliberately scoped away
from `docs/`) plus Ruff on any staged `apps/vision-service/**/*.py`
files. `.husky/commit-msg` no longer validates against
`commitlint.config.cjs` — disabled 2026-07-14, see [[Progress]] Known
gaps.

------------------------------------------------------------------------

## Related Notes

- [[PRD-Phase-1]] — REQ-1.16 through REQ-1.23.
- [[ADR-003-kafka-distribution-local-compose]] — why Redpanda.
- [[ADR-001-monorepo-tooling]] — why Python's CI job is separate from
  the Nx graph.
- [[Repository_Structure]] — `infrastructure/` layout.
- [[API_Shell]] — `apps/api/.env.local`/`prisma.config.ts` details and the
  known-gap history behind the fix referenced above.
