---
title: Architecture Overview
type: architecture
tags: [architecture]
status: accepted
---

# Architecture Overview

## Architectural style

The platform combines:

- modular monolith principles for the initial NestJS control plane;
- event-driven architecture for asynchronous workflows;
- independently deployable Python vision workers;
- object storage for large binary artifacts;
- edge nodes for local inference;
- a React operator workspace.

## Core containers

### React Workspace

Responsibilities:

- mission creation;
- upload orchestration;
- video and map visualization;
- progress monitoring;
- result review;
- audit visibility.

### NestJS Control Plane

Responsibilities:

- identity and authorization;
- mission lifecycle;
- metadata;
- signed storage access;
- Kafka publishing and consumption;
- WebSocket updates;
- audit orchestration.

### Python Vision Worker

Responsibilities:

- video decoding;
- preprocessing;
- model inference;
- object tracking;
- annotation;
- output artifact generation;
- performance metrics.

### Kafka

Responsibilities:

- durable commands and events;
- workload distribution;
- replay;
- decoupling;
- independent analytics and audit consumers.

### PostgreSQL/PostGIS

Responsibilities:

- transactional metadata;
- mission and job states;
- geospatial data — real as of Phase 7's `telemetry_points` table
  (`geography(Point, 4326)`, see [[PRD-Phase-7]] REQ-7.1), not just an
  aspirational entry in this list;
- outbox and processed-event records.

### MinIO/S3

Responsibilities:

- source video;
- annotated video;
- snapshots;
- telemetry files;
- datasets — real as of Phase 8's `datasets` bucket (see [[PRD-Phase-8]]
  REQ-8.3, `apps/api`'s `DatasetsModule`), not just an aspirational
  entry in this list;
- model artifacts — real as of Phase 8's `models` bucket (REQ-8.9,
  `apps/api`'s `ModelRegistryModule` and `apps/vision-service`'s
  `training/train.py`).

### Edge Runtime

Responsibilities:

- approved sensor ingestion;
- local inference;
- offline buffering;
- secure synchronization;
- device health.

## Primary flow

```text
React → NestJS → PostgreSQL + Outbox → Kafka
                                      ↓
                              Python Vision Worker
                                      ↓
                            MinIO + Kafka Events
                                      ↓
                      NestJS → WebSocket → React
```

## Consistency model

- PostgreSQL transactions protect local state.
- Transactional Outbox bridges PostgreSQL and Kafka.
- Consumers use at-least-once delivery.
- Idempotency prevents duplicate side effects.
- UI state is eventually consistent for asynchronous processing.

---

## Related Notes

- [[Guiding_Principles]] — principles this architecture implements.
- [[Quality_Attributes]] — trade-offs prioritized by this architecture.
- [[Technology_Decisions]] — rationale for each technology named above.
- [[Repository_Structure]] — how these containers map to repo folders.
- [[MVP_Implementation_Plan]] — phased build-out of this architecture.
- [[PRD-Phase-8]] — made the datasets/model-artifacts MinIO responsibilities real.
