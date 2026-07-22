# Ratchet guide — screenshot inventory

Canonical served path:
<https://www.vygo.ai/vibe-coding/ratchet-guide/screenshot-inventory.md>

Audited page: <https://www.vygo.ai/vibe-coding/ratchet-guide>
Audit date: 2026-07-22 (audit-only pass — the guide page, its templates, and
its existing assets were not modified).

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
      — status: present
- [x] slot `quick-start` / step 3 "Describe your goal" — asset
      `/content/ratchet-guide-assets/ratchet-guide-composer-goal-capture-opt.webp`
      — status: present
- [x] slot `quick-start` / step 4 "Accept the draft queue" — asset
      `/content/ratchet-guide-assets/ratchet-guide-composer-draft-queue-opt.webp`
      — status: present
- [x] slot `quick-start` / step 5 "Set your limits" — asset
      `/content/ratchet-guide-assets/ratchet-guide-composer-run-limits-opt.webp`
      — status: present
- [x] slot `quick-start` / step 6 "Start the run" — asset
      `/content/ratchet-guide-assets/ratchet-guide-composer-mission-control.png`
      — status: resolved (2026-07-22: real 1440×900 capture of the live
      composer's mission.yaml preview pane with the Save & Launch button, demo
      form values only; the step caption/prose now names Save & Launch, the
      control that replaced the retired "Start run" button)
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
      PII appear in frame.)

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

## Summary

- Total image slots on the published guide page: **6**
- Slots with status `missing`, `placeholder-only`, or `broken-URL`: **0**
  (gap-fill pass of 2026-07-22: step 6 resolved with
  `ratchet-guide-composer-mission-control.png`; step 7 resolved later the
  same day with `ratchet-guide-dashboard-mission-timeline-opt.webp`, a
  sanitized demo-data render of the live dashboard runs view — all six slots
  now carry a real capture)

## Machine-readable inventory (2026-07-22)

The slot states above are also published as JSON at the stable public path
<https://www.vygo.ai/content/ratchet-guide-assets/screenshot-inventory.json>
(committed at `apps/web/public/content/ratchet-guide-assets/screenshot-inventory.json`,
alongside the guide screenshot assets). Every former gap slot there carries
either `"status": "resolved"` plus its committed asset filename, or
`"status": "blocked"` plus a non-empty concrete reason.
