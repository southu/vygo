# Follow-ups — figure slots whose UI no longer exists 1:1

These slots describe a UI that is **not present on the live dashboard**, so they
render the frame-only placeholder (no `<img>`, no served asset). Per this
mission's scope, the guide's **textual content is not rewritten here** — each is
recorded below for a **separate guide-text revision mission**.

Source of truth: `apps/web/src/content/ratchet-guide-image-inventory.ts` (rows
`fig-05`, `fig-06`) and the served inventory at
<https://www.vygo.ai/vibe-coding/ratchet-guide-image-inventory>.

---

## FU-1 — fig-05-mission-control

- **Slot:** `fig-05-mission-control`
- **Guide depicts:** "The mission control screen, showing the **Start run** button."
- **Live reality (`https://dash.saniorem.com/composer`):** there is no "Start run"
  button. A mission is committed with **Enqueue** / **Save & Launch** and started
  by the queue runner; **Pause** / **Resume** run controls live on `/queue`.
- **Why deferred:** closing this requires a **guide-text change** (rename the
  control and re-describe the commit/start flow), which is out of scope for a
  figure-only verification mission.
- **Proposed revision-mission action:** update the step prose + caption to
  "Enqueue / Save & Launch" and point run controls at `/queue`, then capture a
  1440×900 frame of the composer commit control.

## FU-2 — fig-06-mission-timeline

- **Slot:** `fig-06-mission-timeline`
- **Guide depicts:** "The mission timeline panel, showing **build, deploy gate, and
  test status per iteration**."
- **Live reality (`https://dash.saniorem.com/dashboard`):** the dashboard surfaces
  an **Active runs** table (Mission / Status / Iter / Streak / Cost) plus a
  Finished & aborted section — but **no per-iteration build / deploy-gate / test
  breakdown**. Runs data is also control-plane-gated: an unauthenticated render
  shows a data-load error, and an authenticated render would expose real operator
  run data (**PII**), so no clean sanitized timeline is capturable.
- **Why deferred:** closing this requires a **guide-text change** (re-describe the
  dashboard as an Active-runs table, drop the per-iteration timeline claim), which
  is out of scope here. A capturable figure also depends on a sanitized/demo runs
  view existing.
- **Proposed revision-mission action:** revise the prose + caption to match the
  Active-runs table, or gate the figure on a sanitized demo dashboard state.

---

**Scope note:** both slots correctly render frame-only placeholders today (no
broken `<img>`, no stale asset), so they do **not** violate any figure acceptance
criterion. They are text-accuracy follow-ups, not figure defects.
