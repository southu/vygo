# Rebuild checklist (greenfield)

← [Operations](./operations.md) · [Index](./README.md) · Next: [AI prompts](./ai-prompts.md)

Use this as a phased plan for a human or coding agent. Check off in order; do not skip mock loop before real APIs.

---

## Phase A — Host

1. Linux server (Ubuntu LTS fine) with sudo/root
2. Packages: `python3`, `git`, `nginx`, `python3-yaml` or `yq`, build tools as needed
3. Install/auth **Claude** and **Grok** CLIs; confirm headless flags work under a systemd `PATH`
4. Create trees:

   ```bash
   mkdir -p /srv/ratchet/control /srv/ratchet/harness /srv/ratchet/projects
   ```

5. Place sources: ratchet harness, composer-live, lazy-mode, vault-mode (clone or rsync)
6. Optional: Node/pnpm if your first product needs them on the same box

---

## Phase B — Configuration & units

1. Write `composer.env` (see [layout.md](./layout.md))
2. Write `secrets.env` mode `600` (tokens, `LAZY_CONTROL_TOKEN`)
3. Configure **team git identity** (not a blocked bot name)
4. Install systemd units; set Composer **`KillMode=process`**
5. `systemctl enable --now` composer, lazy, vault, sentinel, console
6. nginx TLS + basic auth; proxy three hosts to 8377–8379
7. Open `/version` + `/health` without basic auth on dash if self-missions use public URL

Verify:

```bash
systemctl is-active ratchet-composer ratchet-lazy ratchet-vault
curl -sS http://127.0.0.1:8377/health
```

---

## Phase C — Vault

1. Start vault; complete first-run master password
2. Add Railway (or other) credentials; Access ON; folder scope
3. Enable consumer key; arm for hours; store key path `0600`
4. Wire `VAULT_URL` + `VAULT_CONSUMER_KEY_PATH`
5. Preflight `railway.whoami` (or mock) before any provision mission

---

## Phase D — First product

1. Create `/srv/ratchet/projects/<slug>/project.json` with repo + live_url + version_url
2. Implement product `/version` returning deploy SHA
3. Bind cloud project UUID if using Railway
4. **Mock loop** zero-cost:

   ```bash
   cd /srv/ratchet/harness
   bin/ratchet run missions/mock-loop.yaml --scenario fixtures/scenarios/happy.txt
   ```

5. Local fixture full loop (real CLIs, fake deploy) if available — see [examples.md](./examples.md)
6. Tiny real mission (one acceptance) against the product
7. Enqueue from Composer UI; watch queue + `runs/*/loop.out`

---

## Phase E — Hardening

1. Arm Sentinel when you want babysitting
2. Configure Lazy bedtime + Medic playbooks
3. Optional ops-heal timer ([operations.md](./operations.md))
4. Practice **operator sidecar**: Grok Build CLI, ~2 min until clean / ~10 min until done ([operations.md](./operations.md#operator-sidecar-grok-build-babysit), [ai-prompts.md § G](./ai-prompts.md#g-operator-sidecar-babysit))
5. Write **your** `docs/operator/` pack (INDEX, reboot, footguns, changelog)
6. Install this guide under `docs/ratchet-guide/` for friends/AIs
7. Backup strategy for vault ciphertext + secrets.env (encrypted off-box)
8. Document who is allowed to unlock vault and arm consumers

---

## Minimal “hello world” acceptance

You are done with MVP when:

- [ ] Mock loop exits 0
- [ ] Real builder pushes and proof-of-work passes on a throwaway repo
- [ ] Deploy gate sees `/version` move
- [ ] Real tester returns structured PASS/FAIL
- [ ] Composer enqueue → queue → run works from the browser
- [ ] Composer restart does **not** kill an in-flight worker (`KillMode=process`)
- [ ] Vault lock doesn’t dump secrets into run logs

---

## What to build first (engineering order)

1. Harness loop + mock adapters + mission schema
2. Real builder adapter + proof-of-work
3. Deploy gate (version-endpoint)
4. Real tester + verdict schema
5. Composer queue API + static Build UI
6. project.json + Projects UI
7. Vault + consumer broker
8. Lazy observe mode
9. Sentinel
10. Medic + heal timer

Skip cloud provision until core loop is boringly reliable.

Continue → [AI prompts](./ai-prompts.md)
