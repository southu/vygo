# Guide screenshot validation checklist

Every new guide screenshot validated against the live `dash.saniorem.com` UI it
depicts. One row per screenshot slot in the guide's image-slot inventory
(`apps/web/src/content/ratchet-guide-image-inventory.ts`) — **no invented
slots**. Each row records the screenshot's repo path, its public URL, the
`dash.saniorem.com` route captured, the guide step it supports, the viewport,
`content_match` (the image shows exactly the described UI: correct page, named
buttons/labels visible, no error states, no unrelated content), `pii_review`
(full-resolution review confirming no real emails, tokens, or other sensitive
values appear), and `flagged`.

- **Inventory source:** `apps/web/src/content/ratchet-guide-image-inventory.ts`
- **Guide:** <https://www.vygo.ai/vibe-coding/ratchet-guide> — section
  "Run your first mission" (`#quick-start`)
- **Dashboard depicted:** <https://dash.saniorem.com>
- **Viewport (all slots):** 1440×900 @ 100% (matches the capture inventory)
- **Machine-readable copy (served over HTTP):**
  <https://www.vygo.ai/guide/screenshot-checklist.json> — a JSON array with one
  row per screenshot, each carrying the screenshot's public URL so the checklist
  and the images are verifiable over HTTP.

## How each row was validated

For every captured screenshot the image was read back at full resolution and
compared field-by-field against the wording of the guide step it illustrates
(page, headings, named buttons/labels/fields), then inspected for any real
email, token, API key, or other sensitive value. No image was cropped, doctored,
or fabricated to force a pass. When a mismatch is a stale/wrong capture it is
re-captured from the live route at the recorded viewport; when the mismatch is
that the guide prose names a control the live UI no longer has, the row is
**flagged** for a follow-up **guide-text revision** (guide prose is not rewritten
in this mission).

## Result summary

| Outcome                                                                                | Slots          | Count |
| -------------------------------------------------------------------------------------- | -------------- | ----- |
| Non-flagged — content_match **pass** + pii_review **pass**                             | fig-01, fig-04 | 2     |
| Flagged `guide-text-drift` (real clean capture retained; step names a renamed control) | fig-02, fig-03 | 2     |
| Flagged `UI-no-longer-exists` (no 1:1 UI; no image, none fabricated)                   | fig-05, fig-06 | 2     |

Every **non-flagged** row passes both `content_match` and `pii_review`.

## Checklist

| Slot                       | Screenshot file                                                                               | Public URL                                                                                        | Dash route                            | Guide step                                              | Viewport        | content_match | pii_review | flagged | Flag reason         |
| -------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------- | --------------- | ------------- | ---------- | ------- | ------------------- |
| fig-01-product-shell-setup | `apps/web/public/content/ratchet-guide-assets/ratchet-guide-composer-product-shell-setup.png` | <https://www.vygo.ai/content/ratchet-guide-assets/ratchet-guide-composer-product-shell-setup.png> | `https://dash.saniorem.com/composer`  | Run your first mission › Step 1: Create a product shell | 1440×900 @ 100% | **pass**      | **pass**   | false   | —                   |
| fig-02-goal-capture        | `apps/web/public/content/ratchet-guide-assets/ratchet-guide-composer-goal-capture.png`        | <https://www.vygo.ai/content/ratchet-guide-assets/ratchet-guide-composer-goal-capture.png>        | `https://dash.saniorem.com/composer`  | Run your first mission › Step 3: Describe your goal     | 1440×900 @ 100% | fail          | **pass**   | true    | guide-text-drift    |
| fig-03-draft-queue         | `apps/web/public/content/ratchet-guide-assets/ratchet-guide-composer-draft-queue.png`         | <https://www.vygo.ai/content/ratchet-guide-assets/ratchet-guide-composer-draft-queue.png>         | `https://dash.saniorem.com/composer`  | Run your first mission › Step 4: Accept the draft queue | 1440×900 @ 100% | fail          | **pass**   | true    | guide-text-drift    |
| fig-04-run-limits          | `apps/web/public/content/ratchet-guide-assets/ratchet-guide-composer-run-limits.png`          | <https://www.vygo.ai/content/ratchet-guide-assets/ratchet-guide-composer-run-limits.png>          | `https://dash.saniorem.com/composer`  | Run your first mission › Step 5: Set your limits        | 1440×900 @ 100% | **pass**      | **pass**   | false   | —                   |
| fig-05-mission-control     | _(none — no image)_                                                                           | _(none)_                                                                                          | `https://dash.saniorem.com/composer`  | Run your first mission › Step 6: Start the run          | 1440×900 @ 100% | fail          | pass       | true    | UI-no-longer-exists |
| fig-06-mission-timeline    | _(none — no image)_                                                                           | _(none)_                                                                                          | `https://dash.saniorem.com/dashboard` | Run your first mission › Step 7: Watch it iterate       | 1440×900 @ 100% | fail          | pass       | true    | UI-no-longer-exists |

## Per-slot notes

- **fig-01-product-shell-setup** — **pass / pass.** Image shows the Composer
  Target project + Deploy fieldset with the **repo** (Git remote), **live_url**
  (Live URL), and **version_endpoint** (Version endpoint) fields named by the
  step. Demo values only (`demo-mission`, `github.com/acme/demo-app`,
  `demo.example.com`, `/version`); no real emails, tokens, or secrets; no error
  state.
- **fig-02-goal-capture** — **flagged: guide-text-drift.** The captured Goal
  region is a real, clean capture (GOAL section with the mission/**Goal** field
  plus the acceptance-criteria list and **+ Add criterion** / **Skip** controls)
  and contains no PII (demo mission text only) → `pii_review` pass. `content_match`
  is **fail** against the step wording: the step names a separate **Constraints**
  field that does not exist on the live composer — constraints are expressed via
  the acceptance-criteria list. Re-capture cannot resolve this (the named control
  no longer exists). **Follow-up guide-text revision:** rename "Constraints field"
  to the acceptance-criteria list. Image is a real capture (not fabricated),
  retained for reference. Matches inventory status `NEEDS-REVIEW`.
- **fig-03-draft-queue** — **flagged: guide-text-drift.** The captured Mission
  queue panel is a real, clean capture (server-rendered queue list with the
  **Enqueue** button and **Priority order** label, plus AI assist / Draft form
  and the `mission.yaml` preview) and contains no PII (demo queue items and demo
  config only) → `pii_review` pass. `content_match` is **fail** against the step
  wording: the step names an **Accept draft** button that does not exist on the
  live composer — drafts are committed via **Inject into mission** / **Enqueue**.
  Re-capture cannot resolve this (the named control no longer exists).
  **Follow-up guide-text revision:** rename "Accept draft" to Enqueue / Inject
  into mission. Image is a real capture (not fabricated), retained for reference.
  Matches inventory status `NEEDS-REVIEW`.
- **fig-04-run-limits** — **pass / pass.** Image shows the Composer **Limits**
  section with the three fields named by the step: **max_iterations**
  (Max iterations = 10), **consecutive_passes_required** (Pass streak = 2), and
  **max_budget_usd** (Spend cap = 25). Demo values only; no real emails, tokens,
  or secrets; no error state.
- **fig-05-mission-control** — **flagged: UI-no-longer-exists.** The step depicts
  a **Start run** button on a mission-control screen; the live composer has no
  such control — a mission is committed with **Enqueue** / **Save & Launch** and
  started by the queue runner (Pause/Resume live on `/queue`). No 1:1 UI exists,
  so **no image was written and none was fabricated**. **Follow-up guide-text
  revision:** replace "Start run" with Enqueue / Save & Launch + queue runner.
  Matches inventory `capture=flagged`.
- **fig-06-mission-timeline** — **flagged: UI-no-longer-exists.** The step depicts
  a Mission timeline panel with a per-iteration build / deploy-gate / test
  breakdown. The live `/dashboard` surfaces an Active runs table
  (Mission/Status/Iter/Streak/Cost) but no per-iteration breakdown, and its runs
  data is control-plane-gated (unauthenticated render shows a data-load error;
  authenticated render would expose real operator run data / PII). No clean,
  sanitized timeline is capturable, so **no image was written and none was
  fabricated**. **Follow-up guide-text revision:** describe the Active runs table
  instead of a per-iteration timeline. Matches inventory `capture=flagged`.
