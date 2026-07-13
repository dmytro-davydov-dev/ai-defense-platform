---
title: Quality Attributes
type: quality-attributes
tags: [architecture, quality-attributes]
status: accepted
---

# Quality Attributes

## Priority order

1. Security and auditability
2. Reliability and recoverability
3. Maintainability
4. Observability
5. Performance
6. Scalability
7. Portability
8. Usability

## Security

- least-privilege access;
- OIDC-compatible identity;
- encryption in transit and at rest;
- secrets outside source control;
- immutable audit records;
- signed builds and model artifacts.

## Reliability

- idempotent consumers;
- retry with bounded backoff;
- dead-letter handling;
- Transactional Outbox;
- resumable processing where practical;
- explicit failure states.

## Performance

Initial targets:

- API p95 under 300 ms for metadata operations;
- progress-event propagation under 2 seconds in local deployment;
- configurable video-processing throughput;
- no media transfer through Kafka;
- bounded memory during long-video processing.

## Scalability

- stateless API replicas;
- Kafka consumer groups;
- independent vision workers;
- partition keys preserving mission ordering;
- object storage for large files;
- GPU-aware worker pools.

## Maintainability

- clean module boundaries;
- typed contracts;
- ADRs for significant choices;
- automated quality gates;
- isolated adapters for external systems.

## Observability

Every mission should be traceable through:

- correlation ID;
- event ID;
- mission ID;
- job ID;
- model version;
- source artifact checksum;
- processing duration;
- failure reason.

## Portability

- local Docker Compose;
- Kubernetes deployment;
- S3-compatible storage;
- ONNX as portable inference format;
- vendor-specific acceleration isolated behind adapters.

---

## Related Notes

- [[Goals]] — non-functional goals these attributes prioritize.
- [[Architecture_Overview]] — architecture shaped by this priority order.
- [[Guiding_Principles]] — principles behind each attribute category.
