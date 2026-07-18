# Composer (control plane UI)

← [Loop & missions](./loop-and-missions.md) · [Index](./README.md) · Next: [Lazy / Medic / Sentinel](./lazy-medic-sentinel.md)

---

## Role

Composer is the human-facing factory for a Ratchet-style control plane:

- Capture goals in natural language
- Draft and split multi-step missions
- Manage product shells and the mission queue
- Show run status at a glance
- Point humans at credentials management (without putting secrets in chat)

It is a **product surface**, not a published internal module inventory or private API catalog.

---

## Primary capabilities (product ideas)

| Capability            | Purpose                                                         |
| --------------------- | --------------------------------------------------------------- |
| **Build / goal home** | Natural language goal → multi-step queue draft                  |
| **Classic compose**   | Structured mission form when you already know the brief         |
| **Product shells**    | Create and edit the binding of repo + live URL + version signal |
| **Queue**             | See and manage work scoped per product                          |
| **Runs overview**     | What is running, finished, or blocked                           |
| **Settings**          | Models and defaults for assist / builder / tester roles         |

Exact routes, filenames, and internal APIs are install-private and intentionally omitted here.

---

## Goal → queue → run (product flow)

1. **Describe** — human states product work; optional attachments where the UI supports them
2. **Draft** — a planner expands multi-part goals into several focused steps (roughly a handful for real product work)
3. **Enqueue** — each step becomes a queue item scoped to a **product shell**
4. **Run** — the harness materializes a mission and drives build → deploy gate → live test
5. **Observe** — UI reflects status; humans decide whether to re-plan or clear unfinished work

### Queue-builder product rules

- Multi-part goals **must** expand to several steps — not one mega-mission
- Prefer steps small enough to verify live, large enough to make progress
- Thin drafts (single vague step) should be resplit before enqueue
- Planner output must be structured mission material — not silent junk prose
- Scope must match the **product** shell, not the control plane by accident
- Repo and live URL come from the product shell binding, not control-plane self-facts

### Clearing work (design idea)

Bulk clear should make the filter obvious: some modes drop queued work while **keeping an on-screen draft** so humans can re-enqueue without re-planning from zero. Aggressive wipe modes exist as a product choice — the label should say what it does.

---

## Models & assist (concepts)

- Roles such as builder, tester, assist, and writer may use different model defaults
- Assist turns plain language into a draft mission payload
- Invalid or unknown model choices should surface real errors — never synthetic “success” prose
- Some CLIs use interactive login rather than long-lived keys in secret env; either way, secrets stay out of agent workspaces

---

## Navigation product rule

Every primary surface should show the **same** high-level destinations so humans never get lost: goal capture, products, compose, queue, runs, settings, credentials. Responsive collapse is a UX detail, not an install recipe.

---

## Self-hosting Composer as a product

The control plane can itself be improved by the same loop:

- Needs a cloneable git remote for its own tree
- Needs a live version signal the deploy gate can read

That is a product symmetry, not a host procedure.

Continue → [Lazy / Medic / Sentinel](./lazy-medic-sentinel.md)
