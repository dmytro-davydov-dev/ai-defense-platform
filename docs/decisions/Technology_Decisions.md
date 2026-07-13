---
title: Technology Decisions
type: decision
tags: [architecture, technology]
status: accepted
---

# Technology Decisions

## React + TypeScript

Chosen for a rich operator workspace, typed contracts, video overlays and GIS integration.

## NestJS

Chosen as the control-plane framework because it provides strong modularity, dependency injection, validation, OpenAPI support, WebSocket gateways and Kafka integration.

## Python + FastAPI

Python is the primary ecosystem for computer vision and ML. FastAPI provides typed HTTP control endpoints and operational health interfaces.

## OpenCV

Used for image/video decoding, frame transforms, annotation and pipeline utilities.

## YOLO

Used initially as a practical detection framework behind an internal detector interface. The architecture must allow replacement by another model.

## Apache Kafka

Chosen for durable event streams, replay, consumer groups, scalable asynchronous processing and portfolio-level distributed-systems learning.

Kafka is not used to carry video frames or model files.

## PostgreSQL + PostGIS

Chosen for transactional state, relational integrity, outbox support and geospatial querying.

## MinIO / S3-compatible storage

Chosen for large binary artifacts and local-to-cloud portability.

## Redis

Optional. Used for cache, rate limiting or short-lived coordination only. It is not the primary durable job backbone.

## ONNX Runtime

Chosen as a portable inference runtime across development, cloud and edge environments.

## TensorRT

Used as an optional NVIDIA-specific optimization behind an adapter.

## Docker Compose and Kubernetes

Docker Compose supports local development. Kubernetes is introduced after core workflows stabilize.

## OpenTelemetry

Chosen as the common instrumentation layer for traces, metrics correlation and service context propagation.

---

## Related Notes

- [[Architecture_Overview]] — containers these technologies implement.
- [[Guiding_Principles]] — Technology Independence principle constrains these choices.
- [[Quality_Attributes]] — attributes these technologies were chosen to satisfy.
- [[ADR-000-template]] — each choice above should eventually have its own ADR.
