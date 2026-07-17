# Rebuild checklist (greenfield)

← [Operations](./operations.md) · [Index](./README.md) · Next: [AI prompts](./ai-prompts.md)

Use this as a phased plan for a human or coding agent. Check off in order; do not skip mock loop before real APIs. Paths use the placeholder root `RATCHET_ROOT`.

---

## Phase A — Host

1. Machine with a modern Linux or container host and package manager access
2. Packages: `python3`, `git`, a reverse proxy of your choice, YAML tooling, build tools as needed
3. Install/auth **Claude** and **Grok** CLIs; confirm headless flags work under your service `PATH`
4. Create trees:

   ```bash
   mkdir -p RATCHET_ROOT/control RATCHET_ROOT/harness RATCHET_ROOT/projects
   ```

5. Place sources: ratchet harness, composer-live, lazy-mode, vault-mode (clone or copy)
6. Optional: Node/pnpm if your first product needs them on the same box

---

## Phase B — Configuration & services

1. Write `composer.env` (see [layout.md](./layout.md))
2. Write `secrets.env` mode `600` (tokens, `LAZY_CONTROL_TOKEN`)
3. Configure **team git identity** (not a blocked bot name)
4. Install process-manager units/services; ensure Composer restarts do **not** kill detached builders
5. Start composer, lazy, vault, sentinel
6. Edge TLS + basic auth; proxy three hostnames to the loopback control-plane ports
7. Open product `/version` (and optional `/health`) without control-plane basic auth

Verify with your process manager’s status command and each service’s `/health` (or equivalent).

---

## Phase C — Vault

1. Start vault; complete first-run master password
2. Add Railway (or other) credentials; Access ON; folder scope
3. Enable consumer key; arm for hours; store key path `0600`
4. Wire `VAULT_URL` + `VAULT_CONSUMER_KEY_PATH`
5. Preflight `railway.whoami` (or mock) before any provision mission

---

## Phase D — First product

1. Create `RATCHET_ROOT/projects/<slug>/project.json` with repo + live_url + version_url
2. Implement product `/version` returning deploy SHA
3. Bind cloud project UUID if using Railway
4. **Mock loop** zero-cost:

   ```bash
   cd RATCHET_ROOT/harness
   bin/ratchet run missions/mock-loop.yaml --scenario fixtures/scenarios/happy.txt
   ```

5. Local fixture full loop (real CLIs, fake deploy) if available — see [examples.md](./examples.md)
6. Tiny real mission (one acceptance) against the product
7. Enqueue from Composer UI; watch queue + `runs/*/loop.out`

---

## Phase E — Hardening

1. Arm Sentinel when you want automated queue supervision
2. Configure Lazy bedtime + Medic playbooks
3. Keep private ops notes separate from this share pack
4. Install this guide under your docs tree for friends/AIs
5. Backup strategy for vault ciphertext + secrets.env (encrypted off-box)
6. Document who is allowed to unlock vault and arm consumers

---

## Minimal “hello world” acceptance

You are done with MVP when:

- [ ] Mock loop exits 0
- [ ] Real builder pushes and proof-of-work passes on a throwaway repo
- [ ] Deploy gate sees `/version` move
- [ ] Real tester returns structured PASS/FAIL
- [ ] Composer enqueue → queue → run works from the browser
- [ ] Composer restart does **not** kill an in-flight worker
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
10. Medic recovery surfaces

Skip cloud provision until core loop is boringly reliable.

Continue → [AI prompts](./ai-prompts.md)
