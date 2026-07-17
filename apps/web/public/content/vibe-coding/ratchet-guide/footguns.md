# Footguns (design pitfalls)

← [AI prompts](./ai-prompts.md) · [Index](./README.md) · Next: [Examples](./examples.md)

Common design mistakes when building an AI build-and-verify control plane. These are product-level lessons about contracts and boundaries — not a host operations runbook.

---

## Deploy truth

| Pitfall | Why it hurts | Design direction |
| ------- | ------------ | ---------------- |
| No public version signal | The deploy gate has nothing honest to poll | Every product serves a version signal with the deployed git SHA |
| Auth blocking the version path for the gate | Gate polls fail forever; loops look “stuck” | Leave the version signal readable to the gate |
| Repo and live URL from different products | Gate waits on the wrong deploy | Bind repo + live URL + version URL from one product shell |
| Treating the builder tree as done | Live never caught up | Tester judges the live URL only; gate waits for version match first |

---

## Builder proof-of-work

| Pitfall | Why it hurts | Design direction |
| ------- | ------------ | ---------------- |
| Trusting agent claims over git | “Done” with no real commit | Require real history advance, ancestry, remote match, clean work |
| Empty “success” commits | Streaks without product change | Require content-changing commits |
| Force-push / rewrite of shared history | Breaks deploy and review trails | Reject non-fast-forward proof-of-work |

---

## Missions & queue shape

| Pitfall | Why it hurts | Design direction |
| ------- | ------------ | ---------------- |
| One mega-mission for multi-part goals | Hard to accept, hard to resume | Expand real product goals into several focused steps |
| Synthetic / non-structured planner output as a mission | Queue fills with junk | Validate planner output; retry or force a structured draft |
| Control-plane shell for product work | Wrong repo, wrong live URL | Scope each queue item to the product shell |
| Clearing drafts with the goal still unfinished | Human re-plans from zero | Prefer clear modes that keep the on-screen draft when you want it |

---

## Secrets & credentials

| Pitfall | Why it hurts | Design direction |
| ------- | ------------ | ---------------- |
| Cloud tokens in builder or tester env | Secrets leak into prompts and logs | Broker credentials outside agent workspaces |
| Printing secret material into chat | Irreversible exposure | Never paste keys; keep private notes out of share packs |
| Optional infra ensure always on | Accidental project spam or long hangs | Prefer bound project identities; treat ensure as opt-in and fail-closed |

---

## Models & adapters

| Pitfall | Why it hurts | Design direction |
| ------- | ------------ | ---------------- |
| Wrong flags for a model mode | Silent failure or odd drafts | Match adapters to what the binary actually supports |
| Unknown model id treated as success prose | Fake missions look real | Surface real adapter errors; fail closed on registry misses |
| Self-improvement without a cloneable origin | Control plane cannot be improved by the same loop | Seed a real remote when the control plane is also a product |

---

## Hygiene do / don’t

**Do**

- Keep product version signals honest and reachable by the deploy gate
- Scope work by product shell with matching repo + live URL
- Prefer multi-step queues for multi-part goals
- Keep secrets out of builder and tester environments
- Record durable behavior changes in private install notes (not this pack)

**Don’t**

- Treat deploy-gate timeouts as “just retry” without checking version truth
- Mix product acceptance with control-plane repo settings
- Hardcode machine-specific paths into shared docs
- Ask overnight helpers to ship product features
- Commit or paste credentials into share packs or chat

Continue → [Examples](./examples.md)
