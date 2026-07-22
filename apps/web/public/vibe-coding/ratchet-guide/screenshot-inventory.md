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
`present` | `missing` | `placeholder-only` | `broken-URL` | `suspect-stale`.

- `present` — the referenced image URL returns HTTP 200 with valid,
  renderable image content, and the capture is current.
- `placeholder-only` — the slot renders the frame-only placeholder (caption
  text, no `<img>`, no served asset).
- `missing` / `broken-URL` / `suspect-stale` — no slot currently qualifies
  (see verification below).

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
- [ ] slot `quick-start` / step 6 "Start the run" — no asset; frame-only
      placeholder captioned "The mission control screen, showing the Start run
      button." (planned asset name
      `ratchet-guide-composer-mission-control.png`) — status: placeholder-only
- [ ] slot `quick-start` / step 7 "Watch it iterate" — no asset; frame-only
      placeholder captioned "The mission timeline panel, showing build, deploy
      gate, and test status per iteration." (planned asset name
      `ratchet-guide-dashboard-mission-timeline.png`) — status: placeholder-only

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
- Slots with status `missing`, `placeholder-only`, or `broken-URL`
  (capture targets for the later capture step): **2**
- Target slots' section slugs (one line): `quick-start` (step 6, mission
  control), `quick-start` (step 7, mission timeline)
