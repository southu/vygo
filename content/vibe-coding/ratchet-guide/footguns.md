# Footguns (design pitfalls)

← [AI prompts](./ai-prompts.md) · [Index](./README.md) · Next: [Examples](./examples.md)

Common design mistakes when building an AI build-and-verify control plane. These are product-level lessons about contracts and boundaries — not a host operations runbook.

---

## Deploy truth

| Pitfall | Why it hurts | Design direction |
| ------- | ------------ | ---------------- |
| No public version endpoint | The deploy gate has nothing honest to poll | Every product serves `GET /version` with the deployed git SHA |
| Auth on the version path | Gate polls fail forever; loops look “stuck” | Leave `/version` (and optional product `/health`) readable to the gate |
| Repo and live URL from different products | Gate waits on the wrong deploy | Bind repo + `live_url` + version URL from one `project.json` shell |
| Treating the builder tree as done | Live never caught up | Tester judges `live_url` only; gate waits for SHA match first |

---

## Builder proof-of-work

| Pitfall | Why it hurts | Design direction |
| ------- | ------------ | ---------------- |
| Trusting agent claims over git | “Done” with no real commit | Harness checks HEAD advance, ancestry, remote match, clean tree |
| Empty “success” commits | Streaks without product change | Require content-changing commits |
| Force-push / rewrite of shared history | Breaks deploy and review trails | Reject non-fast-forward proof-of-work |

---

## Missions & queue shape

| Pitfall | Why it hurts | Design direction |
| ------- | ------------ | ---------------- |
| One mega-mission for multi-part goals | Hard to accept, hard to resume | Expand real product goals into several focused steps (~4–8) |
| Synthetic / non-JSON planner output as a mission | Queue fills with junk | Validate planner output; retry or force a structured draft |
| Control-plane folder for product work | Wrong repo, wrong live URL | Scope each queue item to the product folder shell |
| Clearing drafts with the goal still unfinished | Human re-plans from zero | Prefer clear modes that keep the on-screen draft when you want it |

---

## Process boundaries

| Pitfall | Why it hurts | Design direction |
| ------- | ------------ | ---------------- |
| Restarting the UI process kills active builders | In-flight work dies mid-push | Detached workers must outlive control-plane restarts |
| Dual owners of the same ports | Orphans and port fights | One process model owns each service role |
| Night-watch tools implementing product features | Ops automation invents UI instead of recovering state | Builders implement product; watchdogs only observe / salvage queue state |

---

## Secrets & credentials

| Pitfall | Why it hurts | Design direction |
| ------- | ------------ | ---------------- |
| Cloud tokens in builder or tester env | Secrets leak into prompts and logs | Broker credentials outside agent workspaces |
| Printing secret env into chat | Irreversible exposure | Never paste keys; keep private notes out of share packs |
| Optional infra ensure always on | Accidental project spam or long hangs | Prefer bound project IDs; treat ensure as opt-in and fail-closed |

---

## Models & adapters

| Pitfall | Why it hurts | Design direction |
| ------- | ------------ | ---------------- |
| Wrong CLI flags for a model mode | Silent failure or odd drafts | Match adapter flags to what the binary supports |
| Unknown model id treated as success prose | Fake missions look real | Surface real adapter errors; fail closed on registry misses |
| Self-improvement without a cloneable origin | Apply / self-missions cannot push | Seed a real remote when the control plane is also a product |

---

## Hygiene do / don’t

**Do**

- Keep product `/version` honest and public to the gate
- Scope work by project folder with matching repo + live URL
- Prefer multi-step queues for multi-part goals
- Keep secrets out of builder and tester environments
- Record durable behavior changes in private install notes (not this pack)

**Don’t**

- Blind-retry deploy failures without checking gate truth
- Mix product acceptance with control-plane repo settings
- Hardcode machine-specific paths into shared docs
- Ask recovery tools to ship product features
- Commit or paste credentials into share packs or chat

Continue → [Examples](./examples.md)
