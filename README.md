# AI Defense Platform

AI Defense Platform is an architecture-first reference platform for building secure, observable, event-driven computer-vision systems for defense-oriented workflows.

The repository is organized as an **Architecture Knowledge Base** and implementation workspace. It starts with recorded and synthetic video analysis, geospatial visualization, asynchronous AI inference, distributed event processing, and edge deployment.

## Safety and scope boundary

The platform is limited to defensive, analytical, training, simulation, logistics, inspection, search-and-rescue, and situational-awareness use cases.

It explicitly excludes:

- use of classified, illegally obtained, or privacy-invasive data.

## Repository structure

```text
ai-defense-platform/
├── README.md
├── docs/
│   ├── vision/
│   ├── roadmap/
│   ├── architecture/
│   ├── adr/
│   ├── c4/
│   ├── backend/
│   ├── frontend/
│   ├── python/
│   ├── ai/
│   ├── kafka/
│   ├── edge/
│   ├── devops/
│   ├── observability/
│   ├── security/
│   ├── testing/
│   └── decisions/
├── diagrams/
├── examples/
├── apps/
└── packages/
```

## Knowledge base

The `docs/` folder is an Obsidian-compatible vault: every document has
YAML frontmatter (title, type, tags, status) and wikilink-style links to
related notes. Open `docs/` as an Obsidian vault and start from
[`docs/MOC.md`](docs/MOC.md) (Map of Content) to navigate via links,
tags, or the graph view.

## Prerequisites

- Node.js 20+ and [pnpm](https://pnpm.io) 9+ (`corepack enable` will
  activate the pinned version from `package.json`'s `packageManager`
  field).
- [uv](https://docs.astral.sh/uv/) for the Python vision-service
  (`docs/adr/ADR-002-python-dependency-manager.md`).
- Docker and Docker Compose v2.

## Local setup

```bash
# 1. Install TS dependencies (also installs the Husky git hooks)
pnpm install

# 2. Install the Python vision-service dependencies
cd apps/vision-service && uv sync && cd ../..

# 3. Configure local environment
cp .env.example .env   # edit values if needed — never commit .env
```

## Running the full stack

```bash
docker compose --env-file .env -f infrastructure/compose/docker-compose.yml up --build
```

This boots PostgreSQL+PostGIS, Redpanda (Kafka API — see
`docs/adr/ADR-003-kafka-distribution-local-compose.md`), MinIO, and the
three app shells, with no manual steps beyond the setup above. Once
healthy:

| Service          | URL                                                     |
| ---------------- | ------------------------------------------------------- |
| web              | http://localhost:5173                                   |
| api              | http://localhost:3000 (`/health`, `/ready`)             |
| vision-service   | http://localhost:8000 (`/health`, `/ready`, `/version`) |
| MinIO console    | http://localhost:9001                                   |
| Postgres         | localhost:5432                                          |
| Redpanda (Kafka) | localhost:19092                                         |

## Per-app dev commands

TypeScript apps/packages are orchestrated with
[Nx](https://nx.dev) over pnpm workspaces
(`docs/adr/ADR-001-monorepo-tooling.md`):

```bash
pnpm build           # nx run-many -t build   (all apps/packages)
pnpm lint             # nx run-many -t lint
pnpm typecheck         # nx run-many -t typecheck
pnpm test               # nx run-many -t test
pnpm build:affected      # nx affected -t build   (only changed projects)
```

Run a single app directly, e.g.:

```bash
pnpm --filter @ai-defense/web dev      # Vite dev server
pnpm --filter @ai-defense/api start:dev # NestJS with watch
```

`apps/vision-service` is managed independently via uv (kept outside the
Nx graph, per ADR-001):

```bash
cd apps/vision-service
uv run fastapi dev src/vision_service/main.py
uv run ruff check .
uv run pytest
```

## CI

Every PR runs `.github/workflows/ci.yml`: Conventional Commit
validation, `nx affected` lint/typecheck/test/build for TS
apps/packages, Ruff/pytest for `apps/vision-service`, and a Docker build
per app shell. See [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) for
the branch/release strategy.
