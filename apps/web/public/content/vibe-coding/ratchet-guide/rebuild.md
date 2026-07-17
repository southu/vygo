# Rebuild checklist (greenfield)

← [Operations](./operations.md) · [Index](./README.md) · Next: [AI prompts](./ai-prompts.md)

Use this as a phased plan for a human or coding agent. Check off in order; do not skip mock loop before real APIs. Paths use the placeholder root `RATCHET_ROOT`.

This is a product rebuild outline — not a host operations runbook.

---

## Phase A — Foundations

1. Development machine or container host with a package manager
2. Packages: `python3`, `git`, YAML tooling, build tools as needed
3. Install/auth model CLIs you will use (for example Claude and Grok); confirm headless flags work
4. Create trees:

   ```bash
   mkdir -p RATCHET_ROOT/control RATCHET_ROOT/harness RATCHET_ROOT/projects
   ```

5. Place sources: ratchet harness, composer-live, vault-mode (clone or copy)
6. Optional: Node/pnpm if your first product needs them on the same box

---

## Phase B — Configuration

1. Write non-secret service config (see [layout.md](./layout.md))
2. Keep secrets in a separate file mode `600` (never in this pack)
3. Configure **team git identity** for harness commits (host platforms may block bot authors)
4. Bring up Composer, harness, and Vault under your own install process
5. Confirm product `/version` is reachable by the deploy gate

---

## Phase C — Credentials boundary

1. Stand up the vault (private master password — never in this pack)
2. Store cloud credentials with access scoped to project folders
3. Give the harness a consumer key path only (no tokens in builder env)
4. Wire vault URL + consumer key path into harness env only
5. Confirm broker identity checks succeed **before** any optional infra step

---

## Phase D — First product

1. Create `RATCHET_ROOT/projects/<slug>/project.json` with repo + live_url + version_url
2. Implement product `/version` returning deploy SHA
3. Bind cloud project UUID if you use a cloud host (prefer reuse over create)
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

1. Keep private install notes separate from this share pack
2. Install this guide under your docs tree for friends/AIs
3. Backup strategy for vault ciphertext + secret env (encrypted off-box; private)
4. Document vault access policy privately (who may unlock / arm)

---

## Minimal “hello world” acceptance

You are done with MVP when:

- [ ] Mock loop exits 0
- [ ] Real builder pushes and proof-of-work passes on a throwaway repo
- [ ] Deploy gate sees `/version` move
- [ ] Real tester returns structured PASS/FAIL
- [ ] Composer enqueue → queue → run works from the browser
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
8. Optional overnight observe helpers (no product features)

Skip optional cloud provision until core loop is boringly reliable.

Continue → [AI prompts](./ai-prompts.md)
