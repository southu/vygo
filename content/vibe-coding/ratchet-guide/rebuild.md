# Rebuild checklist (greenfield concepts)

← [Operations](./operations.md) · [Index](./README.md) · Next: [AI prompts](./ai-prompts.md)

Use this as a **product-design** checklist for a human or coding agent. It describes what to invent, not how to administer a host. Order matters: mock the loop before real agents and real deploys.

This is a rebuild outline — not a host operations runbook.

---

## Phase A — Foundations (what you need)

1. A development environment that can run your chosen model CLIs
2. Git and a place to host product remotes
3. Clarity on which models will play builder vs tester vs assist
4. Three logical product areas: control plane, harness, product shells (place them wherever you like)
5. Sources or stubs for: loop orchestration, goal-capture UI, credentials boundary

No package lists, service unit files, or host filesystem maps live here.

---

## Phase B — Configuration (product rules)

1. Separate non-secret service config from secret material
2. Keep secrets out of this pack and out of chat
3. Choose a **team git identity** the host will accept for harness commits
4. Confirm product version signals will be reachable by the deploy gate
5. Prefer documenting private install choices offline

---

## Phase C — Credentials boundary (shape)

1. Stand up *some* encrypted store for long-lived credentials (private master material — never in this pack)
2. Scope cloud access to product shells, not global agent env
3. Give the harness only brokered access — no tokens in builder env
4. Confirm identity checks fail closed **before** any optional infra ensure
5. Never log secret values

---

## Phase D — First product (milestones)

1. Bind one product shell: repo + live URL + version URL
2. Implement an honest public version signal on the product
3. Prefer binding a known cloud project identity when using a cloud host
4. Prove the loop with a **mock** campaign (zero model spend) that still exercises streak logic
5. Prove a tiny real mission (one acceptance) against a throwaway product
6. Enqueue from the human UI and watch status advance without treating local trees as truth

Command recipes and fixture paths stay install-private; [examples.md](./examples.md) shows shapes only.

---

## Phase E — Hardening (product hygiene)

1. Keep private install notes separate from this share pack
2. Keep a portable docs pack for friends and coding agents
3. Backup strategy for ciphertext and secret config (encrypted off-box; private)
4. Document credentials access policy privately

---

## Minimal “hello world” acceptance

You are done with MVP when:

- [ ] Mock loop reaches a success streak
- [ ] Real builder pushes and proof-of-work accepts real content commits
- [ ] Deploy gate sees the version signal advance
- [ ] Real tester returns structured pass/fail against the live URL
- [ ] Human enqueue → queue → run works from the browser
- [ ] Vault lock does not dump secrets into run logs

---

## What to build first (engineering order)

1. Loop orchestration + mock roles + mission shape validation
2. Real builder adapter + proof-of-work
3. Deploy gate against a version signal
4. Real tester + verdict contract
5. Goal capture UI + mission queue
6. Product shell model + product UI
7. Credentials boundary + brokered harness access
8. Optional overnight observe helpers (no product features)

Skip optional cloud provision until the core loop is boringly reliable.

Continue → [AI prompts](./ai-prompts.md)
