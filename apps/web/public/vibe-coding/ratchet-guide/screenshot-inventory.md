# Ratchet guide — screenshot inventory

Canonical served path:
<https://www.vygo.ai/vibe-coding/ratchet-guide/screenshot-inventory.md>

Audited page: <https://www.vygo.ai/vibe-coding/ratchet-guide>
Audit date: 2026-07-22 (audit-only pass — the guide page, its templates, and
its existing assets were not modified).
Stale-check pass: 2026-07-22 (later the same day) — every slot's committed
asset was compared against the corresponding live view on
<https://dash.saniorem.com>; see "Suspect-stale disposition" below. Outcome:
zero slots are marked suspect-stale; every slot records an explicit outcome
of `confirmed-current`.

This is a section-by-section checklist of every image slot on the published
Ratchet guide page: every `<img>` tag plus every frame-only screenshot
placeholder the page renders. Slots are keyed by the heading anchor id (section
slug) they appear under. Each slot carries exactly one status from:
`present` | `missing` | `placeholder-only` | `broken-URL` | `suspect-stale`
| `resolved` | `blocked`.

- `present` — the referenced image URL returns HTTP 200 with valid,
  renderable image content, and the capture is current.
- `placeholder-only` — the slot renders the frame-only placeholder (caption
  text, no `<img>`, no served asset).
- `missing` / `broken-URL` / `suspect-stale` — no slot currently qualifies
  (see verification below).
- `resolved` — a former gap slot now backed by a committed, section-named
  real capture (gap-fill pass of 2026-07-22).
- `blocked` — a former gap slot that cannot be captured from the live
  product; the slot entry records the concrete reason and no asset was
  fabricated for it.

## Section `quick-start` — "Run your first mission"

All six figure slots on the published page sit inside this section (heading
anchor `#quick-start`); the page's other sections contain no image slots. Each
slot below is one step card of the quick-start procedure, in page order.
Checked boxes are verified-good slots; unchecked boxes are the capture targets.

- [x] slot `quick-start` / step 1 "Create a product shell" — asset
      `/content/ratchet-guide-assets/ratchet-guide-composer-product-shell-setup-opt.webp`
      — status: present — stale-check outcome: confirmed-current (2026-07-22:
      compared against the live composer at dash.saniorem.com/composer; the
      IDENTITY / TARGET PROJECT / DEPLOY sections with the name, repo,
      live_url, version_endpoint, branch, strategy, and templates / snippets
      controls all render live exactly as captured; asset left byte-for-byte
      untouched)
- [x] slot `quick-start` / step 3 "Describe your goal" — asset
      `/content/ratchet-guide-assets/ratchet-guide-composer-goal-capture-opt.webp`
      — status: present — stale-check outcome: confirmed-current (2026-07-22:
      compared against the live composer; the GOAL section with the mission
      field, acceptance-criteria list, Skip and + Add criterion controls, and
      the BUILDER section with model / max_turns / timeout_seconds /
      allowed_tools all render live exactly as captured; asset left
      byte-for-byte untouched)
- [x] slot `quick-start` / step 4 "Accept the draft queue" — asset
      `/content/ratchet-guide-assets/ratchet-guide-composer-draft-queue-opt.webp`
      — status: present — stale-check outcome: confirmed-current (2026-07-22:
      compared against the live composer; the Mission queue panel with the
      request field, Enqueue button, Priority order list (SKIPLINE items
      first), the AI assist panel, and the mission.yaml preview all render
      live exactly as captured; asset left byte-for-byte untouched)
- [x] slot `quick-start` / step 5 "Set your limits" — asset
      `/content/ratchet-guide-assets/ratchet-guide-composer-run-limits-opt.webp`
      — status: present — stale-check outcome: confirmed-current (2026-07-22:
      compared against the live composer; the TESTER section (model,
      read_only, max_turns, timeout_seconds), HARNESS section (testlog,
      adapters), and LIMITS section (max_iterations,
      consecutive_passes_required, max_budget_usd) all render live exactly as
      captured; asset left byte-for-byte untouched)
- [x] slot `quick-start` / step 6 "Start the run" — asset
      `/content/ratchet-guide-assets/ratchet-guide-composer-mission-control.png`
      — status: resolved (2026-07-22: real 1440×900 capture of the live
      composer's mission.yaml preview pane with the Save & Launch button, demo
      form values only; the step caption/prose now names Save & Launch, the
      control that replaced the retired "Start run" button) — stale-check
      outcome: confirmed-current (2026-07-22: compared against the live
      composer; the mission.yaml preview pane with the Copy, Download .md,
      Download .yaml, Run in Lazy Mode, and Save & Launch controls renders
      live exactly as captured; asset left byte-for-byte untouched)
- [x] slot `quick-start` / step 7 "Watch it iterate" — asset
      `/content/ratchet-guide-assets/ratchet-guide-dashboard-mission-timeline-opt.webp`
      — status: resolved (2026-07-22: real 1440×900 capture of the live
      dash.saniorem.com/dashboard runs view — the deployed dashboard UI
      rendered as-is, with only its /api/runs data call stubbed to sanitized
      demo-mission values, the same demo-value sanitization convention as the
      composer captures. Three active run cards show the loop phases
      building / deploying / testing with per-run iteration and streak, above
      the Finished & aborted table. This clears the earlier blocker: no
      authenticated fetch was made and no operator run data, credentials, or
      PII appear in frame.) — stale-check outcome: confirmed-current
      (2026-07-22: compared against the live dashboard at
      dash.saniorem.com/dashboard; the header nav, ACTIVE RUNS panel, and
      Finished & aborted table with the Mission / Status / Iter / Streak /
      Cost / Started / Updated columns all render live exactly as captured;
      asset left byte-for-byte untouched)

## Live verification (2026-07-22)

Every image URL referenced by the published page's HTML was fetched with curl
against <https://www.vygo.ai>:

| Asset (filename)                                      | HTTP | Content check                 |
| ----------------------------------------------------- | ---- | ----------------------------- |
| `ratchet-guide-composer-product-shell-setup-opt.webp` | 200  | valid WebP, 1440×900, 32.9 kB |
| `ratchet-guide-composer-goal-capture-opt.webp`        | 200  | valid WebP, 1440×900, 26.5 kB |
| `ratchet-guide-composer-draft-queue-opt.webp`         | 200  | valid WebP, 1440×900, 65.1 kB |
| `ratchet-guide-composer-run-limits-opt.webp`          | 200  | valid WebP, 1440×900, 25.4 kB |

All four referenced URLs return HTTP 200 with non-empty, renderable WebP
content, and all four captures were refreshed from the live dashboard on
2026-07-22 (see the guide changelog), so none is stale. The two
`placeholder-only` slots reference no URL from the page; their planned asset
paths intentionally serve 404 until captured. Note: for the two checked slots
whose guide prose has drifted from the live dashboard UI (goal capture's
"Constraints" field, draft queue's "Accept draft" button), the images
themselves are current captures of the live dashboard — the drift is tracked
in the figure inventory at
<https://www.vygo.ai/vibe-coding/ratchet-guide-image-inventory>, not a
screenshot problem.

## Suspect-stale disposition (2026-07-22 stale-check pass)

A dedicated stale-check pass ran on 2026-07-22: every slot's committed asset
was opened side-by-side with the corresponding live view on
<https://dash.saniorem.com> (headless Chromium via Playwright, the same
1440×900 @ 100% viewport convention as the capture set) and compared for
out-of-date UI, bad cropping, or anything that would mislead a reader.

Disposition rules applied: a slot whose asset no longer matched the live app
would have been recaptured in place under its existing section-slug filename
and recorded as `refreshed` (with what was wrong); a slot whose asset still
accurately reflects the live app is recorded as `confirmed-current` and its
file left byte-for-byte untouched.

Per-slot outcomes (also recorded inline on each slot entry above):

| Slot                            | Outcome           | Asset file touched? |
| ------------------------------- | ----------------- | ------------------- |
| step 1 "Create a product shell" | confirmed-current | no                  |
| step 3 "Describe your goal"     | confirmed-current | no                  |
| step 4 "Accept the draft queue" | confirmed-current | no                  |
| step 5 "Set your limits"        | confirmed-current | no                  |
| step 6 "Start the run"          | confirmed-current | no                  |
| step 7 "Watch it iterate"       | confirmed-current | no                  |

Result: 6 of 6 slots confirmed-current, 0 refreshed, and **zero slots are
marked suspect-stale** — no slot carries, or previously carried without a
recorded outcome, the `suspect-stale` status. Every section named by the
captures (composer IDENTITY / TARGET PROJECT / DEPLOY / GOAL / BUILDER /
TESTER / HARNESS / LIMITS, the Mission queue and AI assist panels, the
mission.yaml preview with Save & Launch, and the dashboard ACTIVE RUNS /
Finished & aborted layout) was confirmed present and unchanged on the live
app at check time, so no recapture was warranted and no screenshot asset was
modified or renamed.

## Summary

- Total image slots on the published guide page: **6**
- Slots with status `missing`, `placeholder-only`, or `broken-URL`: **0**
  (gap-fill pass of 2026-07-22: step 6 resolved with
  `ratchet-guide-composer-mission-control.png`; step 7 resolved later the
  same day with `ratchet-guide-dashboard-mission-timeline-opt.webp`, a
  sanitized demo-data render of the live dashboard runs view — all six slots
  now carry a real capture)
- Slots with status `suspect-stale`: **0** — the stale-check pass of
  2026-07-22 compared all six committed assets against the live app and
  recorded an explicit outcome per slot: **6 confirmed-current, 0 refreshed**
  (see "Suspect-stale disposition" above); no asset file was modified or
  renamed

## Machine-readable inventory (2026-07-22)

The slot states above are also published as JSON at the stable public path
<https://www.vygo.ai/content/ratchet-guide-assets/screenshot-inventory.json>
(committed at `apps/web/public/content/ratchet-guide-assets/screenshot-inventory.json`,
alongside the guide screenshot assets). Every former gap slot there carries
either `"status": "resolved"` plus its committed asset filename, or
`"status": "blocked"` plus a non-empty concrete reason.
