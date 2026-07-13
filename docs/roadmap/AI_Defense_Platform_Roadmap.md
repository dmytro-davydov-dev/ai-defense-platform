---
title: AI Defense Platform Roadmap
type: roadmap
tags: [roadmap]
status: accepted
---

# AI Defense Platform Roadmap

## Vision

Build a modular, secure, cloud-native and edge-ready AI platform for defense-oriented video intelligence, geospatial situational awareness, distributed event processing, and operational analytics.

The platform should serve as:

- a production-minded reference architecture;
- a portfolio project at Senior/Staff/Architect level;
- a laboratory for Python, OpenCV, YOLO, Kafka, GIS, MLOps and edge AI;
- a reusable foundation for defensive, analytical, simulation, logistics, inspection and search-and-rescue applications.

The platform is **human-supervised by design**. It may detect, track, classify and visualize objects in recorded, simulated or approved live data, but it must not autonomously select targets, control weapons, optimize strikes or bypass human authorization.

## Strategic principles

- Defense-focused, safety-bounded
- Human-in-the-loop
- Modular and domain-driven
- Event-driven
- API-first
- Cloud-native
- Edge-ready
- Zero-trust oriented
- Observable by default
- Testable and reproducible
- Documentation as code
- Open standards where practical

---

## Phase 0 — Sprint 0: Foundation

### Objective

Create the product, architecture and engineering baseline before implementation.

### Deliverables

- Vision
- Goals
- Guiding Principles
- Quality Attributes
- Architecture Overview
- Technology Decisions
- Repository Structure
- Coding Standards
- Initial risk register
- Architecture Decision Record template
- C4 documentation plan

### Exit criteria

- scope and safety boundaries are explicit;
- key quality attributes are prioritized;
- major technologies have documented rationale;
- repository structure is approved;
- coding and review standards are defined;
- implementation can begin without major architectural ambiguity.

---

## Phase 1 — Repository and Engineering Foundation

### Scope

- monorepo bootstrap;
- TypeScript and Python workspace setup;
- Docker Compose;
- local development environment;
- linting, formatting and testing;
- GitHub Actions;
- dependency management;
- secrets and configuration conventions.

### Deliverables

- React application shell;
- NestJS API shell;
- Python vision-service shell;
- shared contracts package;
- PostgreSQL, Kafka and MinIO locally;
- health checks;
- CI quality gates.

---

## Phase 2 — Core Platform and Identity

### Scope

- mission management;
- users, teams and roles;
- authentication and authorization;
- video and telemetry ingestion;
- object storage;
- audit baseline.

### Technologies

- NestJS;
- PostgreSQL;
- Prisma or TypeORM;
- MinIO/S3-compatible storage;
- JWT/OIDC;
- REST and WebSocket.

### Deliverables

- mission CRUD;
- signed upload/download URLs;
- RBAC;
- immutable audit events;
- API specification;
- basic admin UI.

---

## Phase 3 — Kafka Event Platform

### Scope

Introduce Kafka as the central event-streaming backbone.

### Capabilities

- command and event topics;
- producer and consumer libraries;
- consumer groups;
- partition strategy;
- schema versioning;
- Transactional Outbox;
- idempotent consumers;
- retry and dead-letter handling;
- correlation and causation IDs;
- event replay.

### Initial topics

```text
aidefense.commands
aidefense.processing-events
aidefense.detections
aidefense.telemetry
aidefense.audit
aidefense.device-events
aidefense.dead-letter
```

### Exit criteria

- a mission-processing command reaches a Python worker;
- progress and completion events return to NestJS;
- duplicate delivery is handled safely;
- failed events are observable and recoverable.

---

## Phase 4 — Python and OpenCV Foundation

### Scope

Build the computer-vision runtime without depending completely on a specific model.

### Capabilities

- typed Python packages;
- image and video readers;
- frame iteration;
- preprocessing;
- annotation;
- metadata extraction;
- benchmarking;
- structured logging;
- unit and integration testing.

### Deliverables

- image CLI;
- video CLI;
- FastAPI health and control endpoints;
- normalized frame and detection contracts;
- reproducible test fixtures.

---

## Phase 5 — AI Detection and Tracking

### Scope

Add model inference and object tracking for approved, non-sensitive training categories and datasets.

### Technologies

- YOLO;
- NumPy;
- OpenCV;
- ByteTrack or BoT-SORT;
- ONNX Runtime.

### Deliverables

- object detection;
- configurable confidence and class filters;
- multi-object tracking;
- track history;
- inference metrics;
- annotated video;
- model adapter abstraction.

### Safety constraint

The initial public implementation uses civilian or synthetic object classes and excludes weapon guidance, target scoring and autonomous engagement logic.

---

## Phase 6 — Frontend Mission Workspace

### Scope

Create the operator-facing analytical interface.

### Capabilities

- mission list and detail;
- upload workflow;
- processing status;
- video player;
- detection overlay;
- event timeline;
- filters and statistics;
- WebSocket updates;
- audit visibility.

### Technologies

- React;
- TypeScript;
- Vite;
- Material UI;
- Redux Toolkit;
- RTK Query.

---

## Phase 7 — GIS and Telemetry Platform

### Scope

Connect video, detections and telemetry to geospatial context.

### Technologies

- Mapbox GL JS or MapLibre;
- GeoJSON;
- PostGIS;
- telemetry interpolation.

### Deliverables

- route visualization;
- synchronized video/map timeline;
- spatial layers;
- geofences;
- mission replay;
- spatial queries;
- uncertainty indicators.

### Constraint

Approximate geolocation must be clearly labeled. The platform must not present estimated coordinates as verified targeting coordinates.

---

## Phase 8 — Data, Training and Model Lifecycle

### Scope

Introduce controlled MLOps capabilities.

### Deliverables

- dataset registry;
- provenance and licensing metadata;
- annotation workflow;
- train/validation/test splits;
- experiment tracking;
- evaluation reports;
- model registry;
- promotion and rollback;
- bias and failure analysis.

### Technologies

- MLflow or equivalent;
- DVC or object-storage-based dataset versioning;
- YOLO training pipeline;
- ONNX export.

---

## Phase 9 — Edge Runtime

### Scope

Run local inference near approved sensors when connectivity is constrained.

### Technologies

- NVIDIA Jetson;
- ONNX Runtime;
- TensorRT;
- Docker;
- SQLite local buffer;
- secure device identity.

### Deliverables

- edge agent;
- video capture adapter;
- local inference;
- offline event buffer;
- store-and-forward synchronization;
- health reporting;
- remote model deployment;
- rollback;
- bandwidth-aware upload.

### Constraint

The edge runtime remains an analytical sensor-processing node and does not control weapons or autonomous engagement systems.

---

## Phase 10 — Security Architecture

### Scope

Harden the platform for defense-oriented data handling.

### Deliverables

- threat model;
- zero-trust service communication;
- OIDC and RBAC/ABAC;
- mTLS;
- secrets management;
- encryption at rest and in transit;
- signed artifacts;
- software bill of materials;
- supply-chain controls;
- immutable audit trail;
- retention and deletion policy.

---

## Phase 11 — Observability and Operations

### Technologies

- OpenTelemetry;
- Prometheus;
- Grafana;
- Loki;
- Tempo or Jaeger.

### Deliverables

- distributed tracing;
- metrics and dashboards;
- structured logs;
- Kafka lag monitoring;
- inference latency monitoring;
- GPU/CPU/memory metrics;
- mission-processing SLOs;
- alerting;
- operational runbooks.

---

## Phase 12 — Kubernetes and Delivery Platform

### Scope

Move from local orchestration to a production-minded deployment model.

### Deliverables

- Kubernetes manifests or Helm charts;
- environment overlays;
- autoscaling;
- GPU scheduling;
- persistent storage;
- network policies;
- GitOps;
- progressive delivery;
- rollback;
- disaster-recovery exercises.

---

## Phase 13 — Testing and Verification

### Test layers

- unit;
- component;
- contract;
- integration;
- end-to-end;
- load;
- resilience;
- security;
- model evaluation;
- data-quality tests;
- edge-connectivity tests.

### Critical scenarios

- duplicate Kafka event;
- worker crash during processing;
- object-storage outage;
- interrupted edge connectivity;
- corrupt video;
- incompatible model version;
- unauthorized data access;
- partial database/Kafka failure.

---

## Phase 14 — Production Readiness

### Deliverables

- SLO and error budgets;
- capacity model;
- high availability;
- backup and restore;
- disaster recovery;
- incident response;
- change management;
- cost model;
- compliance evidence;
- operational acceptance checklist.

---

## Phase 15 — Defense Application Modules

The platform core remains reusable, while defense workflows are implemented as bounded application modules.

Potential modules:

- aerial video analysis;
- perimeter and infrastructure monitoring;
- search and rescue;
- logistics route monitoring;
- damage assessment;
- training and simulation review;
- sensor-fusion experimentation;
- equipment inspection;
- incident replay and reporting.

Each module must define:

- authorized users;
- legal and data constraints;
- human-review requirements;
- model limitations;
- audit requirements;
- explicit prohibited uses.

---

## Long-term target architecture

```text
Approved Video / Telemetry / Simulation Sources
                         │
                    Edge Runtime
                         │
          Local inference and secure buffering
                         │
                 Kafka Event Platform
                         │
 ┌───────────────────────┼────────────────────────┐
 │                       │                        │
Mission Service     Vision Workers         Analytics Services
 │                       │                        │
PostgreSQL           MinIO / Models              PostGIS
 │                       │                        │
 └───────────────────────┼────────────────────────┘
                         │
                  NestJS API Gateway
                         │
                 WebSocket / REST
                         │
                    React Workspace
```

## Definition of success

The repository should demonstrate:

- coherent software architecture;
- production-grade TypeScript and Python engineering;
- event-driven distributed processing;
- computer vision and MLOps;
- geospatial analytics;
- secure edge deployment;
- observability and resilience;
- explicit safety and human-oversight boundaries;
- high-quality architecture documentation and ADRs.

---

## Related Notes

- [[Vision]] — long-term direction this roadmap implements.
- [[Goals]] — MVP goals scoped by [[MVP_Implementation_Plan]].
- [[Sprint_0_Foundation]] — detailed backlog for Phase 0.
- [[MVP_Implementation_Plan]] — sequencing and next steps for Phases 1–7.
- [[PRD-Phase-1]] — requirements-level detail for Phase 1.
- [[Initial_Risk_Register]] — risks this phased approach mitigates.
