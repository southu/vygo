# AI prompt pack

← [Rebuild](./rebuild.md) · [Index](./README.md) · Next: [Footguns](./footguns.md)

Paste these into a coding agent when rebuilding or adding a product. Adjust names and paths to match your install. Layout roots below use the placeholder `RATCHET_ROOT` — pick any directory you like.

These prompts are educational starting points for the product design — not host operations procedures.

---

## A. Rebuild from this guide (coding agent)

```text
You are helping me rebuild a Ratchet-style AI build-and-verify control plane.

Read the docs in this guide pack in order (start with README.md, then overview → architecture → principles → layout → loop-and-missions).

Follow the contracts strictly:
- Live deploy gate via /version SHA (tester judges live_url only)
- Builder proof-of-work from git state only (ignore agent claims)
- Secrets only via Vault consumer / service env — never in builder env
- Composer process model must not kill detached builder workers on restart
- Multi-step goals → multiple queue items
- Prefer small blast radius; do not restart the queue host while builds run
- Optional infra ensure is fail-closed; prefer bound cloud project IDs

Target layout (illustrative):
- RATCHET_ROOT/control — composer app, lazy-mode, vault-mode, env files
- RATCHET_ROOT/harness — harness (bin/ratchet, lib/, missions/, runs/)
- RATCHET_ROOT/projects — project.json shells

Start with: harness loop + mock adapters + mission schema validation.
Then: Composer queue API + Build UI.
Then: real adapters, Vault stub, Lazy observe.
Do not invent machine-specific paths for the control-plane install.
```

---

## B. Add a new product folder

```text
Add a new product to Ratchet:

1) Create RATCHET_ROOT/projects/<slug>/project.json with repo, live_url, version_url
2) Ensure product serves GET /version with deployed SHA (public)
3) Bind cloud project UUID if using a cloud host; prefer allow_create=false when bound
4) Smoke: enqueue a tiny mission from Composer with folder=<slug>
5) Watch runs/<name>-*/loop.out and live /version advance

Do not reuse the composer folder for product work.
```

---

## C. Friend share (human)

```text
I'm sharing the Ratchet system guide pack — a portable description of an AI build control plane.
If you want to rebuild it, start at README.md and give your coding agent prompt A from ai-prompts.md.
No secrets are in the pack; you'll need your own model CLIs and cloud tokens.
```

Continue → [Footguns](./footguns.md)
