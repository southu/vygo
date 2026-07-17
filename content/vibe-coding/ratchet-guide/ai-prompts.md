# AI prompt pack

← [Rebuild](./rebuild.md) · [Index](./README.md) · Next: [Footguns](./footguns.md)

Paste these into a coding agent when rebuilding or debugging product missions. Adjust names and paths to match your install. Layout roots below use the placeholder `RATCHET_ROOT` — pick any directory you like.

---

## A. Rebuild from this guide (coding agent)

```text
You are helping me rebuild a Ratchet-style AI build-and-verify control plane.

Read the docs in this guide pack in order (start with README.md, then overview → architecture → principles → layout → loop-and-missions).

Follow the contracts strictly:
- Live deploy gate via /version SHA (tester judges live_url only)
- Builder proof-of-work from git state only (ignore agent claims)
- Secrets only via Vault consumer / service env — never in builder env
- Composer process manager must not kill detached builder workers on restart
- Multi-step goals → multiple queue items
- Prefer small blast radius; do not restart the queue host while builds run
- Fail-fast on dead provision tokens; bind cloud project UUIDs

Target layout (illustrative):
- RATCHET_ROOT/control — composer app, lazy-mode, vault-mode, env files
- RATCHET_ROOT/harness — harness (bin/ratchet, lib/, missions/, runs/)
- RATCHET_ROOT/projects — project.json shells

Start with: harness loop + mock adapters + mission schema validation.
Then: Composer queue API + Build UI.
Then: real adapters, Vault stub, Lazy observe.
Do not invent laptop-specific paths for the control-plane install.
```

---

## B. Debug deploy-timeout only

```text
Mission is hard-failing with deploy-timeout / exit 3.

Investigate in order:
1) Builder push: does origin/main SHA match the run’s expected SHA?
2) Host deploy status (GitHub deployments / cloud deploys) — blocked author?
3) curl live /version — auth? stale SHA?
4) project.json live_url + version_url correct for this folder?
5) Poison mismatch: repo=composer-live but live=product domain?

Do not blind-requeue. Propose the smallest fix.
```

---

## C. Add a new product folder

```text
Add a new product to Ratchet:

1) Create RATCHET_ROOT/projects/<slug>/project.json with repo, live_url, version_url
2) Ensure product serves GET /version with deployed SHA (public)
3) Bind railway_project UUID if using Railway; provision allow_create=false
4) Smoke: enqueue a tiny mission from Composer with folder=<slug>
5) Watch runs/<name>-*/loop.out and live /version advance

Do not reuse the composer folder for product work.
```

---

## D. Friend share (human)

```text
I'm sharing the Ratchet system guide pack — a portable description of an AI build control plane.
If you want to rebuild it, start at README.md and give your coding agent prompt A from ai-prompts.md.
No secrets are in the pack; you'll need your own model CLIs and cloud tokens.
```

Continue → [Footguns](./footguns.md)
