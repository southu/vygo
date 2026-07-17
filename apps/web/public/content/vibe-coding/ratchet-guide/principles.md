# Design principles

← [Architecture](./architecture.md) · [Index](./README.md) · Next: [Layout](./layout.md)

These rules are load-bearing product contracts. Breaking them recreates the failure modes in [footguns.md](./footguns.md).

---

## 1. Live is truth

The tester judges the **deployed** app, not the builder’s working tree.

The deploy gate blocks testing until the world has caught up — by default, until the live version signal matches the commit the builder just pushed.

**Implication:** every product needs an honest public version signal. No signal → timeouts, not “the AI is bad.”

---

## 2. Proof of work for the builder

The loop verifies **git reality**, not agent claims:

- History actually advanced
- Shared history was not rewritten
- New commits change content (empty “success” commits do not count)
- Remote branch matches what the builder claims

If proof fails, the iteration fails closed. Claims without commits are not progress.

---

## 3. Streak, not one-shot

Requiring several consecutive passes prevents “passed once, flaked forever.”

A single fail resets the streak. Open issues stay visible until resolved.

---

## 4. Secrets never in builder env

Cloud tokens, vault master passwords, and long-lived API keys:

- Live behind a **credentials boundary**
- Reach the harness only through **brokered, short-lived actions**
- Must **not** appear in builder or tester process environments or prompts

If a secret shows up in a run transcript, treat it as an incident — not a footnote.

---

## 5. Git identity is part of deploy

Some hosts ignore or block commits from unknown bot authors.

Symptom pattern at product level: push appears to succeed, but live version never moves and the deploy gate times out.

**Design fix:** use a team author the host accepts, or allowlist the automation identity on the host. The product contract still depends on honest live version.

---

## 6. One product shell = one queue scope

Queue items are scoped to a product.

- Product work targets the **product** shell — not the control-plane itself by accident
- Multi-part goals become **several focused steps**, not one mega-mission
- Poison pattern: control-plane repo paired with a product live URL → eternal deploy-gate waits

---

## 7. Optional infrastructure ensure stays small

Creating or binding cloud projects is powerful and dangerous:

- Prefer a known project identity already bound on the product shell
- When bound, do not create new projects as a side effect
- If identity checks fail, fail immediately — never hang forever on ensure

Leave optional ensure **off** until the core loop is boringly reliable.

---

## 8. Small blast radius for automation

Optional overnight helpers:

- May surface stuck work for a human
- Must **not** implement product features (that’s the builder’s job)

---

## 9. Fresh sessions beat chat history

Durable knowledge belongs in a **docs pack** next to the design. Fresh coding sessions should read that pack first — not depend on a laptop transcript.

This share guide is the portable cousin of private install notes.

Continue → [Layout](./layout.md)
