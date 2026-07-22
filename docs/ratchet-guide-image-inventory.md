# Ratchet guide — image-slot inventory

One row per figure slot on the Ratchet guide page
(<https://www.vygo.ai/vibe-coding/ratchet-guide>), in guide order.

A **captured** slot renders through `<ScreenshotPlaceholder asset="…">`, which
emits exactly one `<img>` referencing the **current asset filename** below. A
**flagged** slot renders the frame-only placeholder (no `<img>`, no served
asset) because the UI the guide describes is not present on the live dashboard.
The public, always-in-sync copy of this table is served at
<https://www.vygo.ai/vibe-coding/ratchet-guide-image-inventory> (rendered from
`apps/web/src/content/ratchet-guide-image-inventory.ts`, the single source of
truth behind both surfaces).

**Coverage:** the guide has 6 figure slots and this inventory has exactly 6 rows
— zero unmapped slots, zero extra rows. The number of guide `<img>` references
equals the count of **captured** rows (5); the 1 **flagged** row renders
frame-only.

**Dashboard evidence:** routes, UI states, and capture status were determined by
driving the live `dash.saniorem.com` dashboard in a headless Chromium session
(Playwright fallback — Chrome MCP unavailable) at a fixed **1440×900 @ 100%**
viewport, waiting for network-idle with no spinner/skeleton visible, and matching
each screen against the guide prose:

- `https://dash.saniorem.com/composer` → HTTP 200 (Ratchet Mission Composer)
- `https://dash.saniorem.com/dashboard` → HTTP 200 (Active runs)

A row is marked **OK** only when every element the guide names is confirmed
present on the live dashboard; otherwise **NEEDS-REVIEW**. A row is **captured**
only when a clean, sanitized 1440×900 frame of the described screen was written;
otherwise **flagged** with a reason (the UI the guide describes no longer exists
1:1 — flagged, not guessed).

The machine-readable capture log (route visited, file written, status per slot)
is committed alongside the assets at
`apps/web/public/content/ratchet-guide-assets/capture-log.json` and served at
<https://www.vygo.ai/content/ratchet-guide-assets/capture-log.json>.

| Slot                       | Current asset filename                           | Dash route                            | UI state & elements                                                                                                                                                                                                                                                                                                       | Planned asset name                               | Status       | Capture  |
| -------------------------- | ------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------ | -------- |
| fig-01-product-shell-setup | `ratchet-guide-composer-product-shell-setup.png` | <https://dash.saniorem.com/composer>  | Composer › Target project + Deploy fieldset: the **repo** field (Git remote), the **live_url** field (Live URL), and the **version_endpoint** field (Version endpoint) — all three fields confirmed present on the live composer.                                                                                         | `ratchet-guide-composer-product-shell-setup.png` | OK           | captured |
| fig-02-goal-capture        | `ratchet-guide-composer-goal-capture.png`        | <https://dash.saniorem.com/composer>  | Composer › Goal section: the **mission** field captures the goal. No distinct **Constraints** field exists on the live composer — constraints are expressed via the **acceptance** criteria list (**+ Add criterion** / **Skip** buttons), so the guide's separate "Constraints field" no longer maps 1:1.                | `ratchet-guide-composer-goal-capture.png`        | NEEDS-REVIEW | captured |
| fig-03-draft-queue         | `ratchet-guide-composer-draft-queue.png`         | <https://dash.saniorem.com/composer>  | Composer › Draft form / **Mission queue** panel: the server-rendered queue list with the **Enqueue** button and **Priority order** label. No **Accept draft** button is present — the live composer drafts via **AI assist** and commits with **Inject into mission** / **Enqueue** (queued items also list at `/queue`). | `ratchet-guide-composer-draft-queue.png`         | NEEDS-REVIEW | captured |
| fig-04-run-limits          | `ratchet-guide-composer-run-limits.png`          | <https://dash.saniorem.com/composer>  | Composer › **Limits** section: the **max_iterations** field (Max iterations), the **consecutive_passes_required** field (Pass streak), and the **max_budget_usd** field (Spend cap) — all three limit fields confirmed present on the live composer.                                                                      | `ratchet-guide-composer-run-limits.png`          | OK           | captured |
| fig-05-mission-control     | `ratchet-guide-composer-mission-control.png`     | <https://dash.saniorem.com/composer>  | Composer › **mission.yaml** preview pane: the **Save & Launch** button (save mission YAML and launch immediately) beside the Copy / Download controls, with the composed demo mission YAML in view. The guide step was reworded from the retired "Start run" control to **Save & Launch** (2026-07-22 gap-fill pass).     | `ratchet-guide-composer-mission-control.png`     | OK           | captured |
| fig-06-mission-timeline    | `ratchet-guide-dashboard-mission-timeline.png`   | <https://dash.saniorem.com/dashboard> | Dashboard › **Active runs** panel: the runs table with **Mission**, **Status**, **Iter**, **Streak**, and **Cost** columns plus a **Finished & aborted** section. A distinct per-iteration **build / deploy gate / test** breakdown is not surfaced as separate elements on the live dashboard.                           | `ratchet-guide-dashboard-mission-timeline.png`   | NEEDS-REVIEW | flagged  |

## Capture log

- **fig-01-product-shell-setup** — captured `/composer` → `ratchet-guide-composer-product-shell-setup.png` (1440×900).
- **fig-02-goal-capture** — captured `/composer` → `ratchet-guide-composer-goal-capture.png` (1440×900). Note: guide's "Constraints" field maps to the acceptance-criteria list on the live composer; the Goal region was captured.
- **fig-03-draft-queue** — captured `/composer` → `ratchet-guide-composer-draft-queue.png` (1440×900). Note: no "Accept draft" button; the Mission queue panel (Enqueue, Priority order) was captured.
- **fig-04-run-limits** — captured `/composer` → `ratchet-guide-composer-run-limits.png` (1440×900).
- **fig-05-mission-control** — captured `/composer` → `ratchet-guide-composer-mission-control.png` (1440×900, 2026-07-22 gap-fill pass). Note: the guide's retired "Start run" control was reworded to **Save & Launch**; the mission.yaml preview pane with the Save & Launch button was captured in a demo state (demo-app folder, empty queue).
- **fig-06-mission-timeline** — **flagged** `/dashboard`, no image. Reason: no per-iteration build / deploy-gate / test breakdown is surfaced; runs data is control-plane-gated (unauthenticated render shows a data-load error; authenticated render would expose real operator run data / PII), so no clean sanitized timeline is capturable.

## Notes

- **Captured** slots (`fig-01`–`fig-05`) render a real `<img>` slot pointing at a
  fresh 1440×900 screenshot under
  `apps/web/public/content/ratchet-guide-assets/`.
- The **flagged** slot (`fig-06`) renders the frame-only placeholder and has
  **no** served PNG at its planned asset URL (it returns 404). The figcaption
  still describes what the screen would show; the capture log records the
  reason.
- Captures were taken from a sanitized demo state (composer form pre-filled with
  fake example values). No email addresses, session tokens, or other PII appear
  in any frame, asset path, file content, or commit.
- Planned asset names follow `ratchet-guide-<section>-<state>.png` (lowercase
  slug); for captured slots the current filename already matches the planned name.
