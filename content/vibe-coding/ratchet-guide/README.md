# Ratchet system guide (v1.2)

**Pack version:** v1.2 — shareable product-design documentation (no secrets, no host ops)

**What this is:** documentation for a self-hosted **AI build-and-verify control plane**. A human types a goal; the system drafts missions, runs an AI builder and AI tester in a loop against a real git repo and a **live** deploy, and only finishes when acceptance criteria pass — and keep passing.

**Who it’s for**

- Friends who want to understand or rebuild the _product idea_
- Coding agents you point at this folder (“design me this”)
- Humans returning to the design without chat history

**What is not here**

- API keys, vault master passwords, consumer keys, or cloud tokens
- Private host credentials or real server filesystem paths
- Day-to-day host operations runbooks (process managers, SSH production ops, deploy/host diagnostics, recovery playbooks, vault unlock sequences)
- Internal internal module inventorys, private UI/API topology, environment key catalogs, queue-storage layouts, or monitoring/babysitting workflows

Illustrative examples use only placeholder domains such as `example.com`. Rename freely when rebuilding.

---

## Start paths

| Goal                         | Open                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| **Print one sheet / PDF**    | [`one-pager-print`](./one-pager-print) (File → Print) · or [`one-pager.md`](./one-pager.md) |
| **All diagrams**             | [`diagrams.md`](./diagrams.md)                                                              |
| **What changed in the docs** | [`CHANGELOG.md`](./CHANGELOG.md)                                                            |
| **Point an AI at rebuild**   | [`ai-prompts.md`](./ai-prompts.md) section A                                                |

---

## Read order

| #   | File                                                                  | Contents                                         |
| --- | --------------------------------------------------------------------- | ------------------------------------------------ |
| 1   | [overview.md](./overview.md)                                          | Elevator pitch, flow diagram, component table    |
| 2   | [architecture.md](./architecture.md)                                  | System map, trust boundaries, data flow          |
| 3   | [principles.md](./principles.md)                                      | Design rules (live is truth, proof-of-work, …)   |
| 4   | [layout.md](./layout.md)                                              | Logical product areas (not a host path map)      |
| 5   | [loop-and-missions.md](./loop-and-missions.md)                        | Loop contract, version signal, mission shape     |
| 6   | [composer.md](./composer.md)                                          | Goal capture, queue, product shells (product UX) |
| 7   | [lazy-medic-sentinel.md](./lazy-medic-sentinel.md)                    | Optional overnight helpers (observe only)        |
| 8   | [vault.md](./vault.md)                                                | Credentials boundary shape                       |
| 9   | [projects-and-deploy.md](./projects-and-deploy.md)                    | Product shells and version-signal requirements   |
| 10  | [operations.md](./operations.md)                                      | Pack scope: what is and is not included          |
| 11  | [rebuild.md](./rebuild.md)                                            | Greenfield product milestones (phases A–E)       |
| 12  | [ai-prompts.md](./ai-prompts.md)                                      | Coding / new-product / friend-share prompts      |
| 13  | [footguns.md](./footguns.md)                                          | Design pitfalls and fix directions               |
| 14  | [examples.md](./examples.md)                                          | Mission and product-shell shapes                 |
| —   | [diagrams.md](./diagrams.md)                                          | Mermaid gallery                                  |
| —   | [one-pager-print](./one-pager-print) / [one-pager.md](./one-pager.md) | Printable sheet                                  |
| —   | [CHANGELOG.md](./CHANGELOG.md)                                        | Guide pack history                               |

---

## One-sentence mental model

**Composer** turns intent into queued missions. **Ratchet** is the factory floor (build → deploy gate → test → repeat). **Vault** holds keys the floor needs without giving them to the robots. Optional overnight helpers may observe stuck state — they never implement product features. Every product must tell the truth with a **version signal**.

```mermaid
flowchart LR
  H[Goal] --> C[Composer]
  C --> Q[Queue]
  Q --> B[Build]
  B --> D[Deploy gate]
  D --> T[Test]
  T -->|FAIL| B
  T -->|PASS streak| OK[Done]
```

---

## Pack scope

This multi-file pack is the portable public guide. Prefer it for rebuilds and sharing. It intentionally excludes private install notes and host-specific operations material.
