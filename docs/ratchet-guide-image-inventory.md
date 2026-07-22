# Ratchet guide — image-slot inventory

One row per figure slot on the Ratchet guide page
(<https://www.vygo.ai/vibe-coding/ratchet-guide>), in guide order.

Each figure in the guide renders through `<ScreenshotPlaceholder asset="…">`,
which emits exactly one `<img>` referencing the **current asset filename** below.
The public, always-in-sync copy of this table is served at
<https://www.vygo.ai/vibe-coding/ratchet-guide-image-inventory> (rendered from
`apps/web/src/content/ratchet-guide-image-inventory.ts`, the single source of
truth behind both surfaces).

**Coverage:** the guide source contains 6 figure image references and this
inventory has exactly 6 rows — zero unmapped slots, zero extra rows. The set of
image references in the guide source matches what the live page renders (6 = 6);
no discrepancy.

**Dashboard evidence:** routes and UI-state descriptions were determined by
loading the live `dash.saniorem.com` pages over HTTP and matching them against
the guide prose:

- `https://dash.saniorem.com/composer` → HTTP 200 (Ratchet Mission Composer)
- `https://dash.saniorem.com/dashboard` → HTTP 200 (Active runs)

A row is marked **OK** only when every element the guide names is confirmed
present on the live dashboard; otherwise **NEEDS-REVIEW** (the guide-described UI
may no longer exist 1:1 — flagged, not guessed).

| Slot                       | Current asset filename                           | Dash route                            | UI state & elements                                                                                                                                                                                                                                                                                                       | Planned asset name                               | Status       |
| -------------------------- | ------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------ |
| fig-01-product-shell-setup | `ratchet-guide-composer-product-shell-setup.png` | <https://dash.saniorem.com/composer>  | Composer › Target project + Deploy fieldset: the **repo** field (Git remote), the **live_url** field (Live URL), and the **version_endpoint** field (Version endpoint) — all three fields confirmed present on the live composer.                                                                                         | `ratchet-guide-composer-product-shell-setup.png` | OK           |
| fig-02-goal-capture        | `ratchet-guide-composer-goal-capture.png`        | <https://dash.saniorem.com/composer>  | Composer › Goal section: the **mission** field captures the goal. No distinct **Constraints** field exists on the live composer — constraints are expressed via the **acceptance** criteria list (**+ Add criterion** / **Skip** buttons), so the guide's separate "Constraints field" no longer maps 1:1.                | `ratchet-guide-composer-goal-capture.png`        | NEEDS-REVIEW |
| fig-03-draft-queue         | `ratchet-guide-composer-draft-queue.png`         | <https://dash.saniorem.com/composer>  | Composer › Draft form / **Mission queue** panel: the server-rendered queue list with the **Enqueue** button and **Priority order** label. No **Accept draft** button is present — the live composer drafts via **AI assist** and commits with **Inject into mission** / **Enqueue** (queued items also list at `/queue`). | `ratchet-guide-composer-draft-queue.png`         | NEEDS-REVIEW |
| fig-04-run-limits          | `ratchet-guide-composer-run-limits.png`          | <https://dash.saniorem.com/composer>  | Composer › **Limits** section: the **max_iterations** field (Max iterations), the **consecutive_passes_required** field (Pass streak), and the **max_budget_usd** field (Spend cap) — all three limit fields confirmed present on the live composer.                                                                      | `ratchet-guide-composer-run-limits.png`          | OK           |
| fig-05-mission-control     | `ratchet-guide-composer-mission-control.png`     | <https://dash.saniorem.com/composer>  | Composer commit control: the guide's **Start run** button is not present on the live composer. A mission is committed with the **Enqueue** button and started by the queue runner; the `/queue` page carries the **Pause** / **Resume** run controls.                                                                     | `ratchet-guide-composer-mission-control.png`     | NEEDS-REVIEW |
| fig-06-mission-timeline    | `ratchet-guide-dashboard-mission-timeline.png`   | <https://dash.saniorem.com/dashboard> | Dashboard › **Active runs** panel: the runs table with **Mission**, **Status**, **Iter**, **Streak**, and **Cost** columns plus a **Finished & aborted** section. A distinct per-iteration **build / deploy gate / test** breakdown is not surfaced as separate elements on the live dashboard.                           | `ratchet-guide-dashboard-mission-timeline.png`   | NEEDS-REVIEW |

## Notes

- The guide's figures previously rendered as frame-only SVG placeholders. Each
  now renders a real `<img>` slot pointing at a seeded placeholder asset under
  `apps/web/public/content/ratchet-guide-assets/`, so the guide has concrete,
  replaceable image slots. Guide prose, captions, ordering, and layout are
  unchanged; only the figure image source was wired in.
- Planned asset names follow `ratchet-guide-<section>-<state>.png` (lowercase
  slug). For the seeded slots the current filename already matches the planned
  name; replace the placeholder art in place when real screenshots are captured.
- **OK** rows (`fig-01`, `fig-04`) map to elements confirmed on the live
  composer. **NEEDS-REVIEW** rows flag guide prose whose named control
  (Constraints field, Accept draft button, Start run button) or per-iteration
  timeline breakdown was not found on the current dashboard.
