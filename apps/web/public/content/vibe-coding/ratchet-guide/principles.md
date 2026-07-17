# Design principles

← [Architecture](./architecture.md) · [Index](./README.md) · Next: [Layout](./layout.md)

These rules are load-bearing. Breaking them recreates the failure modes in [footguns.md](./footguns.md).

---

## 1. Live is truth

The tester judges the **deployed** app at `live_url`, not the builder’s working tree.

The deploy gate blocks testing until the world has caught up (by default: live `/version` equals the SHA the builder just pushed).

**Implication:** every product needs an honest version endpoint. No endpoint → timeouts, not “AI is bad.”

---

## 2. Proof of work for the builder

The harness verifies **git state**, not agent claims:

- HEAD advanced from pre-run HEAD
- Pre-run HEAD remains an ancestor (no force-push / rewrite of shared history)
- New commits change content (no empty-only “success”)
- Working tree clean
- Remote branch HEAD matches local HEAD

Failed check → exactly one retry with the check text appended; second failure ends the run (exit 5).

Each iteration resets hard to `origin/<branch>` first so builds start from pushed truth.

---

## 3. Streak, not one-shot

`limits.consecutive_passes_required` (commonly **2**) prevents “passed once, flaked forever.”

A single `FAIL` resets the streak. Bugs remain in `TESTLOG.md` until resolved.

---

## 4. Secrets never in builder env

Cloud tokens, vault master passwords, API keys:

- Live in **Vault** (encrypted at rest) and/or service-only secret env
- Reach the harness via **consumer broker / leases**
- Must **not** appear in builder or tester process environments or prompts

If a secret shows up in a run transcript, treat it as an incident.

---

## 5. Git identity is part of deploy

Host platforms may block commits from unknown bot authors.

Symptoms: push to GitHub succeeds; live `/version` never moves; deploy gate times out.

**Fix:** configure harness/global git as a **team author** allowlisted on the host, or allowlist the bot in the host’s settings.

---

## 6. One project folder = one queue

Queue items are scoped by folder.

- Product work must target the **product** folder — not the control-plane `composer` folder
- Multi-part goals must become **2+ queue steps**, not one mega-mission
- Poison pattern: control-plane repo + product `live_url` → eternal deploy-timeout

---

## 7. Optional infra ensure stays small

Infrastructure ensure (create/bind cloud projects) is powerful and dangerous:

- Prefer binding a known project UUID in `project.json`
- When bound, **do not create** new projects
- If identity checks fail, **fail immediately** — never hang forever on ensure

Turn provision **off** unless you intentionally need stack bootstrap.

---

## 8. Small blast radius for automation

Optional overnight helpers (Lazy / Medic / Sentinel):

- May surface stuck runs for a human
- Must **not** implement product features (that’s the builder’s job)

---

## 9. Fresh sessions beat chat history

Durable knowledge belongs in a **docs pack** next to the install. Fresh coding sessions should read that pack first — not depend on a laptop transcript.

This share guide is the portable cousin of private install notes.

Continue → [Layout](./layout.md)
