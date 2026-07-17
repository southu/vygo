# Vault

← [Lazy / Medic / Sentinel](./lazy-medic-sentinel.md) · [Index](./README.md) · Next: [Projects & deploy](./projects-and-deploy.md)

---

## Role

A local, master-password **credentials vault** for Ratchet/Composer — outside Build/Queue.

- Encrypt secrets at rest
- Human UI for managing access
- **Consumer broker** so the harness can call cloud APIs without putting tokens in builder env

**Bind (illustrative):** `127.0.0.1:8379`  
**Public example hostname:** `https://bot.example.com/`

**Lost master password ⇒ data unrecoverable.** Keep any recovery process offline and private — not in this pack.

---

## Crypto & storage (concept)

- Strong password-based key derivation + authenticated encryption (see a vault SPEC in your install)
- Data directory under vault-mode `data/` (mode 0700, gitignored)
- CSRF + host allowlist + step-up for sensitive human ops

---

## Design idea: consumer plane

Humans hold long-lived cloud credentials in the vault. The harness holds only a **consumer key** that can request named broker actions for a limited window. Builder and tester processes never receive the underlying tokens.

### Ideas

- **Register run** — bind a run id to a folder for audit
- **Action** — named broker ops (identity check, list projects, set config without logging values)
- **Lease / run_tool** — short-lived tool child without exposing secret to parent env

### Example (Python sketch)

```python
from vault_client import VaultClient
vc = VaultClient(key_path="RATCHET_ROOT/control/vault_consumer.key")
vc.register_run("my-run-id", "acme")
print(vc.action("cloud.identity", folder="acme", run_id="my-run-id"))
print(vc.action(
    "cloud.resolve_project",
    folder="acme",
    run_id="my-run-id",
    params={"project_name": "acme", "allow_create": False},
))
```

**Never** put the consumer key or cloud tokens in builder/tester env.

### Broker action families (illustrative)

| Action family | Purpose |
| ------------- | ------- |
| Identity | Confirm credentials are usable before optional infra steps |
| List / resolve projects | Prefer reuse over create; honor bound project IDs |
| Set variable (from vault) | Configure hosts without leaking values in logs |

Exact action names are install-specific; the product rule is **broker, don’t export**.

---

## Optional infra steps (concept)

Some missions may add infra steps **before** build. Keep blast radius small:

1. Prefer binding a known cloud project id in `project.json`; when bound, do not create new projects.
2. Fail closed when identity checks fail — do not hang forever.
3. Treat architect JSON as untrusted input to an allowlist.
4. Consumer responses never include secret values.

Optional infra ensure is powerful; leave it **off** unless you intentionally need stack bootstrap.

---

## What this pack does not include

- Master passwords, consumer keys, or cloud tokens
- Host-private vault administration runbooks
- Day-to-day unlock / arm / rebuild procedures

Those stay in private install notes. This document is the portable **shape** of the credentials boundary.

Continue → [Projects & deploy](./projects-and-deploy.md)
