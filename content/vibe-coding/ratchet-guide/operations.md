# Runtime services (overview)

← [Projects & deploy](./projects-and-deploy.md) · [Index](./README.md) · Next: [Rebuild](./rebuild.md)

Product-level map of the long-running pieces that sit beside the Ratchet loop. This is architecture reference, not a host operations runbook — choose your own process manager, edge proxy, and monitoring.

---

## Service roles

| Service | Role | Notes |
| ------- | ---- | ----- |
| **Composer** | UI, queue, admin | Spawns harness workers; restarts should not kill detached builders |
| **Lazy / Medic** | Overnight watch / recovery UI | Observe and salvage queue state; never implement product features |
| **Vault** | Credentials broker | Encrypted at rest; short-lived consumer access for harness actions |
| **Sentinel** | Queue/composer supervisor | Arm/disarm; quarantine signals |
| **Ratchet harness** | Build → deploy gate → test loop | Invoked per mission; not a public HTTP service |
| **Edge proxy** (optional) | TLS + auth in front of loopback control plane | Leave product `/version` publicly readable for deploy gates |

Default binds in examples are loopback ports (`:8377` Composer, `:8378` Lazy, `:8379` Vault). Bind only where your trust model allows.

---

## Process model (concept)

Whatever starts Composer must keep this product contract:

1. **Detached builder workers outlive Composer restarts** (for example Admin Apply). A control-group kill that reaps the whole tree is the classic footgun.
2. Services can restart on failure with a short backoff.
3. Non-secret config and secret material stay out of agent prompts and UI process arguments.

How you express that in a supervisor config is install-specific; this pack does not prescribe host recipes.

---

## Edge sketch

Typical public hostnames in docs are placeholders (`dash.example.com`, `files.example.com`, `bot.example.com`) reverse-proxied to the loopback control-plane ports.

For deploy gates and external monitors, keep these **product** paths open without control-plane basic auth:

- `/version`
- `/version.txt`
- (optionally) product `/health`

---

## Health (concept)

Each control-plane service should expose a cheap liveness check (path and port are install-specific). Products should expose public `GET /version` returning the deployed git SHA so the harness deploy gate can wait on truth, not agent claims.

---

## Night watch vs product work

| Layer | Role |
| ----- | ---- |
| **Factory** | Composer queue + Ratchet loop + Vault + product deploy |
| **Night watch** | Sentinel / Lazy / Medic — recover queue state, not product features |

Automation may surface stuck runs and report access state. It must **not** implement product features or put secrets into chat logs.

---

## Shipping control-plane code

Ship control-plane updates with your normal release process. Keep secret files and vault ciphertext off shared remotes and out of chat. Private install notes belong outside this share pack.

Continue → [Rebuild](./rebuild.md)
