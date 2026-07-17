# AI prompt pack

← [Rebuild](./rebuild.md) · [Index](./README.md) · Next: [Footguns](./footguns.md)

Paste these into a coding agent when exploring or rebuilding the **product design**. Adjust names to match your own project. These prompts are educational starting points — not host operations procedures.

---

## A. Rebuild from this guide (coding agent)

```text
You are helping me design a Ratchet-style AI build-and-verify control plane.

Read the docs in this guide pack in order (start with README.md, then overview → architecture → principles → layout → loop-and-missions).

Follow the product contracts strictly:
- Live deploy gate via an honest public version signal (tester judges the live URL only)
- Builder proof-of-work from git state only (ignore agent claims)
- Secrets only via a credentials boundary — never in builder env
- Multi-step goals → multiple queue items
- Optional infra ensure is fail-closed; prefer bound cloud project identities
- Overnight helpers may observe only; they never implement product features

Logical product areas (not a host path map):
- Control plane — goal capture UI, product shells, mission queue
- Harness — build → deploy gate → live test loop
- Products — one shell per shipped app

Start with: loop + mock roles + mission shape validation.
Then: goal capture + queue.
Then: real builder/tester roles and a credentials boundary stub.
Do not invent machine-specific install paths or operator runbooks.
```

---

## B. Add a new product shell

```text
Add a new product to a Ratchet-style control plane:

1) Create a product shell with repo, live URL, and version URL bound together
2) Ensure the product serves a public version signal with the deployed git SHA
3) Bind a cloud project identity if using a cloud host; prefer allow_create=false when bound
4) Smoke: enqueue a tiny mission scoped to that product shell
5) Confirm the live version signal advances after a real push + host deploy

Do not point product acceptance at the control-plane repo by accident.
```

---

## C. Friend share (human)

```text
I'm sharing the Ratchet system guide pack — a portable product-design description of an AI build-and-verify control plane.
If you want to rebuild the idea, start at README.md and give your coding agent prompt A from ai-prompts.md.
No secrets are in the pack; you'll need your own model access and cloud tokens.
```

Continue → [Footguns](./footguns.md)
