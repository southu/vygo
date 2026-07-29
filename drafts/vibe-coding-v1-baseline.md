# v1 baseline capture — /vibe-coding

Captured verbatim (content, not markup) from the live v1 `/vibe-coding` hub
page at https://www.vygo.ai/vibe-coding, for section-by-section diffing
against the v2 draft. Source: `apps/web/src/content/vibe-coding.ts` and
`apps/web/src/app/vibe-coding/page.tsx`, matching the deployed HEAD at
capture time. This file is a reference artifact only — it does not change,
replace, or unpublish the live page.

---

## Hero

**Eyebrow:** Vibe coding

**Heading:** Vibe coding that only moves forward

**Intro:** Vibe coding is steering AI builders with clear goals while a
control plane proves every step against the live product. This hub is how we
run it: the loop, the rules, and the guide.

**Primary CTA:** Start free
**Guide CTA:** Read the guide
**Checklist CTA:** Rebuild checklist

---

## Get set up first

Do this once, before reading anything else: download the free guide pack,
open it in your AI coding tool, and paste one setup prompt.

(Rendered as a numbered step list; download-and-paste-prompt mechanics are
product-specific onboarding, not article content.)

---

## Get the guide

A free guide-pack download offer block (product download CTA).

---

## What vibe coding is — and what it is not

**What it is**

- Setting goals and constraints while an AI builder writes and pushes the
  code.
- Iterating in small, verifiable steps against the deployed product, not a
  local hope.
- A control loop: build, pass a live deploy gate, get tested, repeat until a
  streak of passes.

**What it is not**

- Not one mega-prompt expected to produce a finished product overnight.
- Not trusting an agent's claim of "done" — only the live site counts.
- Not a sandbox: no secrets in the builder environment, no unverified
  merges.

---

## The loop

**Intro:** Every mission runs the same ratchet. It never moves backward:

1. **Goal** — A human states the outcome.
2. **Multi-step missions** — Queued as ~4–8 verifiable steps.
3. **Build** — The AI builder pushes code.
4. **Live deploy gate** — `/version` must report the new SHA.
5. **Test** — A tester grades the live site.
6. **Streak of passes** — Consecutive passes close the loop.

**Fail note:** A FAIL sends the mission back to Build with the tester's
report. Nobody babysits; the ratchet just holds.

**Caption:** Goal → multi-step missions → build → live deploy gate → test →
streak of passes.

---

## Non-negotiables

1. **Live is truth** — The tester grades the deployed site at its live URL.
   Local trees and agent claims do not count.
2. **/version must report the deploy SHA** — Every deploy answers with the
   actual git SHA, so the gate can prove what is really live before anything
   is graded.
3. **No secrets in the builder environment** — Credentials stay in Vault and
   are brokered per task. The builder environment never holds them.
4. **Multi-step goals (~4–8 steps), never one mega-prompt** — Real product
   work is queued as multi-step missions, each step small enough to verify
   on its own.

---

## The mental model

Composer is the factory office where goals become queued missions, Ratchet
is the factory floor that runs the build–deploy–test loop, and Vault is the
key cabinet that keeps credentials out of the builder's hands.

---

## Topics

**Intro:** Every card below renders from a single module list — adding a
topic means appending one entry. Start with the guide; the remaining topics
publish here as they ship.

Cards (title — blurb — status):

- **Ratchet system guide** — The full documentation pack: overview,
  architecture, the loop contract, Composer, Vault, design principles, and
  the Mermaid diagram gallery. (available)
- **Rebuild checklist** — Greenfield product milestones in phases A–E:
  foundations, config rules, credentials boundary, first product, then
  hardening. (coming soon)
- **Writing missions** — Scoping goals into 4–8 verifiable steps with
  acceptance criteria a live tester can actually check. (coming soon)
- **Live verify & testing** — How the deploy gate and read-only tester grade
  the live product, and why only a streak of passes counts. (coming soon)
- **Models & costs** — Builder/tester model tiers, what a mission costs end
  to end, and where FAIL cycles add up. (coming soon)
- **Case studies** — Real missions annotated from goal to streak of passes,
  with deploy-gate evidence and honest numbers. (coming soon)
- **Composer walkthrough** — A guided tour of the goal-capture surface:
  drafting multi-step missions, product shells, and queue status. (coming
  soon)
- **Vault deep-dive** — How credentials stay behind a brokered boundary and
  never enter the builder environment. (coming soon)

---

## Final CTA

**Heading:** Build with a ratchet, not a leap of faith

**Body:** Tell us what you are building. We will show you the loop running
against your own live URL.
