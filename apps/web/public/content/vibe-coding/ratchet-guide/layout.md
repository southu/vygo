# Logical layout (product concepts)

← [Principles](./principles.md) · [Index](./README.md) · Next: [Loop & missions](./loop-and-missions.md)

This page describes **logical parts** of a Ratchet-style control plane — not a host filesystem map, not environment variable tables, and not install-private configuration.

---

## Three product areas

| Area | What it is for |
| ---- | -------------- |
| **Control plane** | Human UI for goals, product shells, and the mission queue |
| **Harness** | The build → deploy gate → live test loop and its run workspaces |
| **Products** | One shell per shipped app: repo + live URL + version signal |

You may place these anywhere on disk when rebuilding. This pack deliberately does **not** publish a real install tree, module list, or storage layout.

---

## What each area owns (ideas only)

### Control plane

- Capture natural-language goals
- Expand multi-part goals into several focused missions
- Hold the human view of queue status
- Link humans to credentials management (without putting secrets in chat)

### Harness

- Materialize a mission into an isolated run workspace
- Drive builder, deploy gate, and tester roles
- Record durable campaign notes and end-of-run summaries
- Keep agent environments free of long-lived secrets

### Product shells

Each product is a **binding**, not a bag of unrelated URLs:

| Binding | Why it matters |
| ------- | -------------- |
| Git remote | Where the builder pushes |
| Live URL | What the tester grades |
| Version URL | What the deploy gate polls for honesty |
| Optional cloud project identity | Prefer reuse over accidental create |

When those four disagree, the loop cannot tell truth from coincidence.

---

## What a run workspace *means*

Conceptually, every mission attempt needs:

- A place for the builder to work
- A place for the tester to scratch
- A shared place for verdicts, costs, and durable notes
- A clear end state: success streak, budget stop, contract failure, or abandon

Exact directory names and filenames are install-private.

---

## Configuration hygiene (product rules)

| Rule | Why |
| ---- | --- |
| Separate secret material from non-secret service config | Reduces accidental commit and paste |
| Load secrets only into services that need them | Never into builder/tester agent env |
| Prefer team git identity the host accepts | Deploy gates depend on real deploys landing |
| Document private install choices offline | This pack stays shareable |

No environment variable names, key-file paths, or host topology appear here on purpose.

Continue → [Loop & missions](./loop-and-missions.md)
