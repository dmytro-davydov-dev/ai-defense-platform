---
title: "ADR-004: NestJS ORM — Prisma"
type: adr
tags: [adr, backend, phase2]
status: proposed
---

# ADR-004: NestJS ORM — Prisma

- Status: Proposed
- Date: 2026-07-13
- Decision owners: Dmytro
- Related documents: [[PRD-Phase-2]], [[MVP_Implementation_Plan]], [[Coding_Standards]], [[Technology_Decisions]]

## Context

Phase 2 (`docs/mvp-plan/MVP_Implementation_Plan.md`) requires an ORM
decision before `apps/api` gets its first real modules: missions, users,
teams, roles, audit log, and a Phase-3-facing outbox table. Both
`docs/roadmap/AI_Defense_Platform_Roadmap.md` and
`MVP_Implementation_Plan.md` name "Prisma or TypeORM" as the candidates;
neither commits to one.

Constraints that matter for this choice:

- `Coding_Standards.md` calls for strict TypeScript, DTO validation, and
  "repositories hide persistence details" — the ORM sits behind a
  repository layer either way, so this decision is about developer
  experience, type safety, and migration tooling, not architecture
  shape.
- The schema needs a transactional **outbox table** from day one (Phase
  3 depends on it) — writes to `missions` and `outbox` must happen in
  the same DB transaction.
- PostgreSQL runs with the **PostGIS** extension (`ADR-003`), and Phase 7
  adds `geometry`/`geography` columns for mission routes and telemetry.
  The ORM must not block that, even if native geometry support isn't
  needed until Phase 7.
- This is a portfolio/reference codebase where migration reproducibility
  and generated-type ergonomics for `apps/web`'s future consumption
  (via `packages/contracts`) carry real weight.

## Decision

Use **Prisma** (`@prisma/client` + `prisma migrate`) as the ORM for
`apps/api`.

- `apps/api/prisma/schema.prisma` is the single source of truth for the
  `missions`, `users`, `teams`, `roles`, `audit_log`, and `outbox`
  tables introduced in Phase 2.
- `prisma migrate dev` / `prisma migrate deploy` generate and apply
  versioned SQL migrations, committed under
  `apps/api/prisma/migrations/`.
- Repositories (per `Coding_Standards.md`) wrap `PrismaClient` — no
  controller or application service imports `@prisma/client` directly.
- Multi-statement writes that must be atomic (mission state transition +
  outbox insert, Phase 3) use `prisma.$transaction`.
- PostGIS geometry columns (Phase 7) are modeled with Prisma's
  `Unsupported("geometry(Point, 4326)")` field type and read/written via
  `$queryRaw`/`$executeRaw` — Prisma does not generate native geospatial
  types, so this is an explicit, scoped escape hatch rather than a
  blocker.

## Alternatives considered

### Alternative A — TypeORM

TypeORM is the ORM most NestJS tutorials default to, via the official
`@nestjs/typeorm` integration module, and its decorator-based entities
(`@Entity`, `@Column`) match Nest's own decorator style. It has native
`geometry`/`geography` column types, which would remove the Phase 7
raw-SQL escape hatch Prisma needs.

Rejected as the primary choice because:

- Its Active Record / Data Mapper repository API is weaker on
  compile-time type safety for queries than Prisma's generated client —
  more of the "DTO validation" and "avoid `any`" burden from
  `Coding_Standards.md` would fall on hand-written types.
- Migration generation (`typeorm migration:generate`) is less reliable
  at diffing schema drift than Prisma's migration engine, historically a
  common source of hand-editing migrations in production TypeORM
  projects.
- The `@nestjs/typeorm` integration couples entity definitions closer to
  Nest's DI system than this project wants, given repositories are
  already the abstraction boundary — Prisma's framework-agnostic client
  fits the "hide persistence details behind repositories" rule more
  cleanly.

### Alternative B — Raw SQL / query builder (Kysely, node-postgres)

Rejected for Phase 2: maximum control over generated SQL (useful for
PostGIS) but no migration tooling included, and it pushes type-safety
work onto hand-maintained query types — more engineering overhead than
this phase's scope justifies. Worth reconsidering narrowly for Phase 7's
geospatial queries if Prisma's `Unsupported`/raw-query escape hatch
proves too limiting once real spatial queries (not just storage) are
needed.

## Consequences

### Positive

- Strong end-to-end type safety: `PrismaClient` types flow from
  `schema.prisma` into repositories without hand-written interfaces,
  reducing drift between the DB schema and TypeScript types.
- `prisma migrate` gives reliable, reviewable SQL migration files —
  important for a project that treats documentation and history as
  first-class (`Documentation as Code` principle).
- Prisma Client's `$transaction` API directly supports the outbox
  pattern's "same transaction" requirement Phase 3 needs.

### Negative

- No native PostGIS/geometry column type — Phase 7's spatial columns and
  any spatial queries (`ST_DWithin`, etc.) must go through
  `$queryRaw`/`$executeRaw`, losing some of Prisma's type-safety
  advantage exactly where PostGIS is used.
- Prisma's generated client adds a build step (`prisma generate`) to CI
  and local dev that TypeORM doesn't require.

### Risks

- If Phase 7's spatial query needs grow beyond simple storage/retrieval
  (e.g., geofence containment checks, route simplification at query
  time), the raw-SQL escape hatch could become a maintenance burden.
  Mitigation: revisit this ADR at the start of Phase 7 specifically for
  the spatial-query surface, per the review date below; a mixed
  approach (Prisma for relational tables, a thin Kysely/raw-SQL layer
  scoped to PostGIS queries only) remains an option without touching
  Phase 2's decision.

## Migration and rollback

`schema.prisma` and its generated migrations are additive artifacts;
switching to TypeORM later would mean hand-porting the schema into
TypeORM entities and regenerating an initial migration from the existing
Postgres schema (`typeorm-model-generator` or manual) — a mechanical but
non-trivial one-time cost, not a live-data risk since the underlying
Postgres schema itself doesn't change.

## Review date

Revisit at the start of Phase 7, specifically scoped to whether the
`Unsupported`/raw-SQL PostGIS approach still fits once real spatial
queries (not just geometry storage) are required.

---

## Related Notes

- [[PRD-Phase-2]] — the requirements this ORM choice unblocks.
- [[MVP_Implementation_Plan]] — Phase 2's "NestJS ORM (Prisma vs
  TypeORM)" ADR requirement.
- [[ADR-003-kafka-distribution-local-compose]] — the outbox table this
  ORM's transaction API must support, one phase ahead.
- [[Coding_Standards]] — the repository-hides-persistence rule this
  decision respects either way.
- [[Technology_Decisions]] — PostgreSQL + PostGIS rationale this ADR's
  PostGIS caveat responds to.
