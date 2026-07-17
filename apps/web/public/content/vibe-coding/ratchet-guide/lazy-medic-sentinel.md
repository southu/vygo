# Lazy Mode, Medic, and Sentinel

← [Composer](./composer.md) · [Index](./README.md) · Next: [Vault](./vault.md)

---

## Separation of concerns

| Actor                | May                                                              | Must not                                       |
| -------------------- | ---------------------------------------------------------------- | ---------------------------------------------- |
| **Builder / tester** | Change product code & verify live                                | Control Lazy; read vault secrets               |
| **Lazy**             | Observe health; careful restarts; capped relaunch                | Implement product features                     |
| **Medic**            | Diagnose queues; apply allowlisted recoveries                    | Become a second builder                        |
| **Sentinel**         | Arm/disarm; tick health; quarantine signals                      | Silently thrash composer restarts mid-build    |

Lazy is **not** part of the ratchet harness core loop.

---

## Lazy Mode

**Bind:** `127.0.0.1:8378`  
**Public example:** `https://files.example.com/`

### Modes

| Mode        | Behavior                                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **observe** | Snapshot health / runs / queue; write cycle logs                                                                                                 |
| **ops**     | Restart composer (carefully), align version, remove failed-if-live items, kill zombies, relaunch capped missions with bumped budgets (e.g. +20%) |
| **salvage** | Reserved / evolving agent escalation                                                                                                             |

### Bedtime

Human enables **Bedtime** (or similar preset) on the Lazy UI with a control token (`LAZY_CONTROL_TOKEN` in Lazy env + Composer inject for the header toggle).

### Morning briefing

Dashboard: choose N hours → summarize last N hours → prose + details for copy/download.

### Composer integration

- Header: Lazy on/off + status chip (`lazy-client.js`)
- Optional per-enqueue “run in Lazy Mode”
- Composer can `POST /api/lazy/ensure` to start Lazy if down

CORS must allow the dash origin.

### Knowledge stores

| Path (under lazy-mode)      | Content                 |
| --------------------------- | ----------------------- |
| `SPEC/babysit-lessons.md`   | Campaign narratives     |
| `data/medic/playbooks.json` | Symptom → how playbooks |
| `data/medic/lessons.jsonl`  | Append-only lessons     |

---

## Medic

**Path:** `/medic` on the Lazy host.

Recovery console for:

- Hard-fail / deploy-timeout queue items
- Zombie `running` with dead PIDs
- Selecting blockers and applying **allowlisted** recoveries

**UX honesty:** show whether the action **fixed**, **diagnosed only**, or **blocked**. “OK · applied” that only wrote a note is not a repair.

Medic does **not** implement product UI/features — if the queue writer is wrong, fix the queue builder, don’t ask Medic to invent the product.

### Screenshot / ARG_MAX

Large base64 screenshots in argv blow `ARG_MAX`. Prefer `--prompt-file` (or equivalent) for Medic/Grok invocations.

---

## Sentinel

Supervisor process (`python3 -m sentinel`), UI at Composer `/sentinel`.

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

API sketch: `GET /api/sentinel/status` on Composer.

### Quarantine

Automation may unquarantine fingerprints like “composer_down” once the control plane is healthy again. Prefer explicit policy over blind clear-all.

---

## Automation rules

1. Prefer one process manager for Lazy and Composer — avoid ad-hoc start scripts fighting managed services.
2. Do not let Lazy restart Composer while a builder worker is mid-product-run.
3. Keep Lazy control token out of builder contexts and chat logs.

Continue → [Vault](./vault.md)
