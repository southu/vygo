# Lazy Mode, Medic, and Sentinel

← [Composer](./composer.md) · [Index](./README.md) · Next: [Vault](./vault.md)

Optional **overnight helpers** that sit beside the main loop. They are not part of the core build → deploy gate → test contract.

---

## Separation of concerns

| Actor | May | Must not |
| ----- | --- | -------- |
| **Builder / tester** | Change product code and verify live | Read vault secrets |
| **Lazy / Medic / Sentinel** | Observe runs and surface stuck state | Implement product features; become a second builder |

The harness and builders implement product work. Optional helpers only observe and report. Private install notes stay outside this pack.

---

## Product rules

1. Optional helpers never ship product UI or features.
2. Keep control tokens out of builder contexts and chat logs.
3. Prefer documenting private babysit policy offline; this pack only defines the boundary.

Continue → [Vault](./vault.md)
