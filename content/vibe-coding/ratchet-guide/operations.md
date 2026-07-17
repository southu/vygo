# Runtime services (overview)

← [Projects & deploy](./projects-and-deploy.md) · [Index](./README.md) · Next: [Rebuild](./rebuild.md)

Product-level map of the long-running pieces that sit beside the Ratchet loop. This is architecture, not a host operations runbook — use your own process manager, edge proxy, and monitoring.

---

## Service roles

| Service | Role | Notes |
| ------- | ---- | ----- |
| **Composer** | UI, queue, admin | Spawns harness workers; restarts must not kill detached builders |
| **Lazy / Medic** | Overnight watch / recovery UI | Observe and salvage queues; never implement product features |
| **Vault** | Credentials broker | Encrypted at rest; consumer arm window for harness actions |
| **Sentinel** | Queue/composer supervisor | Arm/disarm; quarantine signals |
| **Ratchet harness** | Build → deploy gate → test loop | Invoked per mission; not a public HTTP service |
| **Edge proxy** (optional) | TLS + auth in front of loopback control plane | Leave product `/version` publicly readable for deploy gates |

Default binds in examples are loopback ports (`:8377` Composer, `:8378` Lazy, `:8379` Vault). Bind only where your trust model allows.

---

## Process-manager contract (concept)

Whatever starts Composer (a service unit, container supervisor, or process manager of your choice) must:

1. **Not kill detached builder workers** when Composer restarts (e.g. Admin Apply). The historical footgun is a control-group kill that reaps the whole process tree.
2. Restart on failure with a short backoff.
3. Load non-secret config and optional secret env files without baking secrets into the UI process arguments.

How you express that in your manager’s config is install-specific; the product contract is only that workers outlive Composer restarts.

---

## Edge sketch

Typical public hostnames in docs are placeholders (`dash.example.com`, `files.example.com`, `bot.example.com`) reverse-proxied to the loopback control-plane ports.

For deploy gates and external monitors, keep these product paths open without control-plane basic auth:

- `/version`
- `/version.txt`
- (optionally) product `/health`

Do not forward client IP headers in a way that breaks loopback-trust admin models unless you redesign auth.

---

## Health (concept)

Each control-plane service should expose a cheap liveness check (path and port are install-specific). Products should expose public `GET /version` returning the deployed git SHA so the harness deploy gate can wait on truth, not agent claims.

---

## Night watch vs product work

| Layer | Role |
| ----- | ---- |
| **Factory** | Composer queue + Ratchet loop + Vault + product deploy |
| **Night watch** | Sentinel / Lazy / Medic — recover ops state, not product features |

Automation may close zombie runs, requeue aborted work with policy, and report vault arm state. It must **not** implement product features or dump secrets into chat logs.

---

## Deploying control-plane code

Ship control-plane updates with your normal release process (git pull, image rebuild, or rsync of source trees). Keep `secrets.env` / vault ciphertext off shared remotes and out of chat. After a full host reboot, Vault may need a human unlock when the DEK is not loaded; arm duration can persist across consumer restarts when still valid.

Continue → [Rebuild](./rebuild.md)
