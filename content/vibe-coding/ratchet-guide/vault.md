# Vault

← [Lazy / Medic / Sentinel](./lazy-medic-sentinel.md) · [Index](./README.md) · Next: [Projects & deploy](./projects-and-deploy.md)

---

## Role

Local, master-password **credentials vault** for Ratchet/Composer — outside Build/Queue.

- Encrypt secrets at rest
- Human UI for unlock / edit / access switches
- **Consumer broker** so the harness can call Railway (etc.) without putting tokens in builder env

**Bind:** `127.0.0.1:8379`  
**Public example:** `https://bot.example.com/`

**Lost master password ⇒ data unrecoverable.** Keep a sealed recovery process offline if you need one.

---

## Crypto & storage

- Argon2id + AES-256-GCM (see vault SPEC)
- Data directory under vault-mode `data/` (mode 0700, gitignored)
- CSRF + host allowlist + step-up for sensitive human ops

---

## Human checklist (Railway example)

1. Unlock with master password
2. Add credential (`provider=railway`), **Access ON**, folders = target slug or `*`
3. **Ratchet consumer** → enable consumer key → write to path with mode `0600`
4. **Arm** for a chosen duration (custom hours input and/or **8h** shortcut; max is bounded server-side)
5. Harness env: `VAULT_URL` + `VAULT_CONSUMER_KEY_PATH`
6. Smoke: harness script / `railway.whoami` must return ok

### Arm persistence

- Arm is **not** only an in-memory flag for the current process lifetime.
- Duration / armed state is **persisted** (consumer arm file) and **restored after consumer restart** while the arm window is still valid.
- After a full reboot you still need **unlock** when the DEK is not loaded; then arm should come back if the saved window has not expired.
- If actions fail with “not armed” right after a short restart, check unlock first, then remaining arm time — not “arm always dies on any bounce.”

```bash
# conceptual — never print key material
RATCHET_ROOT/harness/bin/harness_smoke.sh acme
```

Smoke-style exit codes (reference):

| Code | Meaning              |
| ---- | -------------------- |
| 10   | vault locked         |
| 11   | consumer not armed   |
| 12   | access denied        |
| 13   | missing consumer key |
| 14   | action failed        |

---

## Consumer plane

### Ideas

- **Register run** — bind a run id to a folder for audit
- **Action** — named broker ops (`railway.whoami`, …)
- **Lease / run_tool** — short-lived tool child without exposing secret to parent env

### Example (Python sketch)

```python
from vault_client import VaultClient
vc = VaultClient(key_path="RATCHET_ROOT/control/vault_consumer.key")
vc.register_run("my-run-id", "acme")
print(vc.action("railway.whoami", folder="acme", run_id="my-run-id"))
print(vc.action(
    "railway.resolve_or_provision",
    folder="acme",
    run_id="my-run-id",
    params={"project_name": "acme", "allow_create": False},
))
```

**Never** put the consumer key or Railway token in builder/tester env.

### Broker actions (Railway set)

| Action                                             | Purpose                                                      |
| -------------------------------------------------- | ------------------------------------------------------------ |
| `railway.whoami`                                   | Identity + workspace; **preflight** before provision         |
| `railway.list_projects`                            | Must work with workspace tokens (not only `me { projects }`) |
| `railway.resolve_or_provision`                     | Reuse or create; honor `allow_create` + project UUID         |
| `railway.list_environments`                        | Env discovery                                                |
| `railway.set_variable` / `set_variable_from_vault` | Config without leaking values in logs                        |

---

## Provisioner integration

Mission fields `architect:` + `provision:` (see mission schema).

Rules production learned:

1. **Fail-fast** if `whoami` is not ok (dead token → immediate error, not 90s hang).
2. Read `deploy.railway_project` from project.json; when set, **`allow_create=false`**.
3. Architect JSON is untrusted; provisioner enforces allowlists.
4. Consumer responses never include secret values.

---

## Rebuild vault

If the master password is lost or crypto state is hopeless:

- Documented operator path: backup ciphertext, new master, re-import tokens from a secure source
- Production notes: `vault-rebuild.md` + helper script on the box
- Always require **explicit human OK** before wipe

Continue → [Projects & deploy](./projects-and-deploy.md)
