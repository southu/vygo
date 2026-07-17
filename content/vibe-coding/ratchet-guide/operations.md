# Operations (systemd, nginx, health, heal)

← [Projects & deploy](./projects-and-deploy.md) · [Index](./README.md) · Next: [Rebuild](./rebuild.md)

---

## systemd units

| Unit                     | Process                      | Notes                              |
| ------------------------ | ---------------------------- | ---------------------------------- |
| `ratchet-composer`       | `python3 server.py`          | **`KillMode=process` required**    |
| `ratchet-lazy`           | `python3 -m lazy.web.server` | After network (+ ideally composer) |
| `ratchet-vault`          | `python3 -m vault.server`    |                                    |
| `ratchet-sentinel`       | `python3 -m sentinel`        | Babysit; optional PartOf composer  |
| `ratchet-console`        | ttyd → grok                  | Loopback only                      |
| `nginx`                  | TLS edge                     | Basic auth + reverse proxy         |
| `ratchet-ops-heal.timer` | periodic heal script         | Optional; small blast radius       |

### Composer unit sketch

```ini
[Service]
Type=simple
WorkingDirectory=/srv/ratchet/control/composer-live
EnvironmentFile=/srv/ratchet/control/composer.env
EnvironmentFile=-/srv/ratchet/control/secrets.env
ExecStart=/srv/ratchet/control/venv/bin/python3 /srv/ratchet/control/composer-live/server.py
KillMode=process
Restart=on-failure
RestartSec=3
```

### Day-to-day commands

```bash
systemctl status ratchet-composer ratchet-lazy ratchet-vault ratchet-sentinel nginx --no-pager
systemctl restart ratchet-composer   # avoid during active product builds
journalctl -u ratchet-composer -n 80 --no-pager

# KillMode check
systemctl show ratchet-composer -p KillMode --value   # expect: process
```

**Do not** use `bash run.sh start` for day-to-day on a systemd host — it fights the unit manager and orphans processes.

---

## After reboot

```bash
systemctl start ratchet-composer ratchet-lazy ratchet-vault ratchet-sentinel ratchet-console nginx
systemctl is-active ratchet-composer ratchet-lazy ratchet-vault ratchet-sentinel nginx
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8377/health
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8378/health
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8379/health
```

Vault may need human **unlock** after reboot (master password) when the DEK is not loaded. **Arm** duration is persisted across consumer restarts and restored if the arm window is still valid — you should not need to re-arm only because the vault process bounced.
---

## nginx edge (example)

| Host                | Upstream                                      |
| ------------------- | --------------------------------------------- |
| `dash.example.com`  | `127.0.0.1:8377` + `/console/` → ttyd `:7681` |
| `files.example.com` | `127.0.0.1:8378`                              |
| `bot.example.com`   | `127.0.0.1:8379`                              |

### Open probe paths

For deploy gates and monitors, disable basic auth on exact locations only:

- `/version`
- `/version.txt`
- `/health`

Leave the rest of the control plane behind auth.

### Client IP headers

If Composer treats loopback as trusted for Admin writes, do **not** naively pass `X-Real-IP` / `X-Forwarded-For` from the public internet without a real auth model.

---

## Health checks (loopback, no auth)

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8377/health
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8378/health
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8379/health
curl -sS http://127.0.0.1:8377/api/sentinel/status
curl -sS http://127.0.0.1:8379/api/status   # armed? dek loaded? (no secrets)
```

Product:

```bash
curl -sS https://www.example.com/version
curl -sS https://www.example.com/api/...   # product-specific
```

---

## Ops heal timer (optional)

A small script on a 3-minute timer can:

- Verify `KillMode=process`
- Probe composer health / product `/version`
- Confirm vault armed
- Close zombies (phase=building, pid dead)
- Unquarantine fixed fingerprints
- **Not** restart composer while workers build

Log example: `/srv/ratchet/harness/ops-heal.log`

When babysitting from a laptop agent, the same checklist applies — system-level heal, not only mission cheerleading. See **Operator sidecar** below.

---

## Operator sidecar (Grok Build babysit)

On-box automation (Sentinel, Lazy, heal timer) is not the whole ops story. Operators often run a **sidecar**: a long-lived **Grok Build CLI** session that watches the whole control plane and the active campaign until things are clean, then keeps a lighter watch until the work is done.

### What it is

| Layer           | Role                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| **Factory**     | Composer queue + Ratchet loop + Vault + product deploy                                                       |
| **Night watch** | Sentinel / Lazy / Medic / optional heal timer (on the VPC)                                                   |
| **Sidecar**     | Human opens Grok Build CLI (local laptop or `/console` ttyd) and tasks it to **babysit** with a poll cadence |

The sidecar does **not** implement product features. It reads status, diagnoses stuck deploys, applies small-blast-radius heals, and escalates human-only steps (vault unlock, host allowlists, dead tokens).

### Cadence (default operator practice)

| Phase         | Poll interval         | Until                                                                                                         |
| ------------- | --------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Stabilize** | **every ~2 minutes**  | Services healthy, no zombies, vault armed if needed, active runs not hard-fail thrashing — “things are clean” |
| **Cruise**    | **every ~10 minutes** | Queue items finished (succeeded / intentional discard); campaign done                                         |

Escalate back to the 2‑minute cadence if something breaks again (deploy-timeout storm, composer down, blocked host deploy).

### Typical session

1. Open Grok Build CLI (laptop agent with SSH, or browser console at `dash…/console/`).
2. Point it at operator docs + this guide (`docs/operator/`, `docs/ratchet-guide/`).
3. Paste the **sidecar babysit** prompt from [ai-prompts.md](./ai-prompts.md) section G (or equivalent).
4. Let it poll on the 2 min → 10 min schedule; skim short status lines; intervene only when it escalates.

Paste-ready prompt: [ai-prompts.md § G](./ai-prompts.md#g-operator-sidecar-babysit).

---

## Deploying code from a laptop

```bash
rsync -az --delete \
  --exclude .git --exclude __pycache__ --exclude '*.pyc' \
  --exclude .env --exclude run.log --exclude data \
  ./composer-live/ host:/srv/ratchet/control/composer-live/

# similarly lazy-mode, vault-mode, docs, bin
ssh host 'systemctl restart ratchet-composer ratchet-lazy ratchet-vault'
```

Do **not** clobber `composer.env` / `secrets.env` unless intentional.

---

## Operator console

Browser terminal (ttyd → real Grok Build TUI):

```text
https://dash.example.com/console/
```

- Behind same basic auth as dash
- Starts in `/srv/ratchet/control` with a **fresh** session
- Load `docs/operator/` or this guide pack on first message

Continue → [Rebuild](./rebuild.md)
