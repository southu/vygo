# Lazy Mode, Medic, and Sentinel

← [Composer](./composer.md) · [Index](./README.md) · Next: [Vault](./vault.md)

---

## Separation of concerns

| Actor                | May                                                              | Must not                                       |
| -------------------- | ---------------------------------------------------------------- | ---------------------------------------------- |
| **Builder / tester** | Change product code & verify live                                | Control Lazy; read vault secrets               |
| **Lazy**             | Observe health; limited overnight watch                          | Implement product features                     |
| **Medic**            | Diagnose queue health; allowlisted recoveries                    | Become a second builder                        |
| **Sentinel**         | Arm/disarm; tick health; quarantine signals                      | Silently thrash composer restarts mid-build    |

Lazy is **not** part of the ratchet harness core loop.

---

## Lazy Mode

**Bind (illustrative):** `127.0.0.1:8378`  
**Public example hostname:** `https://files.example.com/`

### Modes (product concept)

| Mode        | Behavior                                                                 |
| ----------- | ------------------------------------------------------------------------ |
| **observe** | Snapshot health / runs / queue; write cycle logs                         |
| **ops**     | Limited recoveries on queue state (never product feature work)           |
| **salvage** | Reserved / evolving agent escalation                                     |

### Bedtime

Human enables **Bedtime** (or similar preset) on the Lazy UI with a control token held in service env (not builder env).

### Morning briefing

Dashboard: choose N hours → summarize last N hours → prose + details for copy/download.

### Composer integration

- Header: Lazy on/off + status chip
- Optional per-enqueue “run in Lazy Mode”
- Composer can ensure Lazy is available when the human turns it on

CORS must allow the dash origin.

### Knowledge stores (install-local)

| Path (under lazy-mode)      | Content                 |
| --------------------------- | ----------------------- |
| `SPEC/babysit-lessons.md`   | Campaign narratives     |
| `data/medic/playbooks.json` | Symptom → how playbooks |
| `data/medic/lessons.jsonl`  | Append-only lessons     |

---

## Medic

**Path:** `/medic` on the Lazy host.

A recovery **console concept** for queue health — diagnose stuck or failed queue items and apply **allowlisted** recoveries only.

**UX honesty:** show whether the action fixed, diagnosed only, or blocked. “OK · applied” that only wrote a note is not a repair.

Medic does **not** implement product UI/features — if the queue writer is wrong, fix the queue builder.

Large base64 screenshots in argv can blow `ARG_MAX`. Prefer prompt files for long model invocations.

---

## Sentinel

Supervisor process, UI at Composer `/sentinel`.

### Concepts

| Field                | Meaning                                       |
| -------------------- | --------------------------------------------- |
| **armed**            | Actively watching / allowed to act per policy |
| **phase / glow**     | cool/cold, watching/idle, etc.                |
| **busy_count**       | In-flight work signal                         |
| **quarantine_count** | Items held back                               |
| **failed_count**     | Recent failures                               |
| **composer_ok**      | Control plane reachable                       |

Arm when you want overnight supervision; disarm when the floor should stay quiet.

### Quarantine

Automation may release items held for control-plane-down once the plane is healthy again. Prefer explicit policy over blind clear-all.

---

## Design rules

1. Prefer one process model for Lazy and Composer — avoid dual owners of the same ports.
2. Do not restart Composer while a builder worker is mid-product-run.
3. Keep Lazy control tokens out of builder contexts and chat logs.
4. Day-to-day recovery procedures stay in private install notes — not this pack.

Continue → [Vault](./vault.md)
