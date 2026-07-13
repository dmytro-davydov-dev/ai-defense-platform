---
title: Initial Risk Register
type: risk-register
tags: [risk]
status: active
---

# Initial Risk Register

| Risk                                                | Probability | Impact | Mitigation                                              |
| --------------------------------------------------- | ----------: | -----: | ------------------------------------------------------- |
| Scope becomes too broad                             |        High |   High | Enforce phased roadmap and MVP boundaries               |
| Kafka adds complexity before value                  |      Medium | Medium | Add after basic processing pipeline contracts are clear |
| Model accuracy is mistaken for certainty            |        High |   High | Show confidence, provenance and review requirements     |
| Sensitive data enters repository                    |      Medium |   High | Data policy, scanning and synthetic fixtures            |
| Duplicate events create side effects                |        High |   High | Idempotency and processed-event records                 |
| Edge connectivity is unreliable                     |        High | Medium | Local buffer and store-and-forward                      |
| GPU-specific optimization reduces portability       |      Medium | Medium | ONNX baseline and adapter pattern                       |
| Architecture documentation diverges from code       |      Medium |   High | Documentation as code and PR checks                     |
| Public framing implies autonomous weapon capability |      Medium |   High | Explicit safety boundaries and excluded capabilities    |

---

## Related Notes

- [[Guiding_Principles]] — principles these risks are weighed against.
- [[AI_Defense_Platform_Roadmap]] — phased mitigation of scope-related risks.
- [[MVP_Implementation_Plan]] — where phase-specific risks are called out inline.
- [[PRD-Phase-1]] — Phase 1's risk table extends this register.
