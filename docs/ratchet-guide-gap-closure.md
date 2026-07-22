# Ratchet guide — gap-closure checklist (final verification pass, 2026-07-22)

Audited page: <https://www.vygo.ai/vibe-coding/ratchet-guide>
Deployed SHA at audit time: `8691283e96ade3c955cf78cd16939c94ae56eb35` (matched
<https://www.vygo.ai/version>).

This is the finalized gap-closure checklist for the published Ratchet guide.
Every section heading on the live guide page is listed below with a final
status of exactly one of: **present from last build** | **newly filled** |
**refreshed** | **blocked: \<reason\>**.

This final pass was verify-only: every check below passed against the live
deployment, so no guide content, template, or screenshot asset was modified.
All previously missing screenshot slots were filled by the last build (see the
slot-level history in
[`apps/web/public/vibe-coding/ratchet-guide/screenshot-inventory.md`](../apps/web/public/vibe-coding/ratchet-guide/screenshot-inventory.md)),
and this pass re-verified each of them against the live page and the live
product UI. Evidence screenshots live in
[`docs/evidence/ratchet-guide/`](evidence/ratchet-guide/).

## Verification summary (this pass)

| Check | Result |
| ----- | ------ |
| Guide page HTTP status | 200 |
| Image URLs referenced by the page (6 total: 5 WebP + 1 PNG, all under `/content/ratchet-guide-assets/`) | all 6 return HTTP 200 with `image/webp` or `image/png` |
| CSS/background image references | none on the page |
| Placeholder / stock / todo / coming-soon markers in `src` or `alt`; empty `src` | none |
| Rendered image slots (headless Chromium, 1440×900) | all 6 `<img>` elements load with naturalWidth 1440 — no visibly empty slots |
| Intrinsic width floor (≥ 800 px) | all 6 assets are 1440×900 |
| Live side-by-side spot-check vs <https://dash.saniorem.com> | 6 of 6 screens compared; all match the current product UI (see per-row notes) |

## Section checklist

Every heading on the live guide page, in page order. Sections other than
"Run your first mission" contain no image slots; their status covers prose and
structure.

| # | Section heading (live page) | Final status | Evidence |
| - | --------------------------- | ------------ | -------- |
| 1 | Ratchet system guide (page title) | present from last build | [guide-page-full.png](https://raw.githubusercontent.com/southu/vygo/main/docs/evidence/ratchet-guide/guide-page-full.png) |
| 2 | Get set up | present from last build | — (no image slots) |
| 3 | Understand what Ratchet does | present from last build | — (no image slots) |
| 4 | Run your first mission | present from last build | all 6 figure slots re-verified — see per-slot rows below |
| 5 | Run the build, deploy, and test loop | present from last build | — (no image slots) |
| 6 | — Build real, provable changes | present from last build | — |
| 7 | — Wait for the deploy gate to confirm your push | present from last build | — |
| 8 | — Test only the live, deployed app | present from last build | — |
| 9 | — Know what "done" means at every layer | present from last build | — |
| 10 | Go further with advanced usage | present from last build | — (no image slots) |
| 11 | — Plan multi-step campaigns instead of one mega-mission | present from last build | — |
| 12 | — Turn on infrastructure provisioning carefully | present from last build | — |
| 13 | — Avoid the common design pitfalls | present from last build | — |
| 14 | — Know the core components | present from last build | — |
| 15 | — Read the full system guide | present from last build | — |
| 16 | — Browse every file in the pack | present from last build | — |
| 17 | Troubleshooting & FAQ | present from last build | — (no image slots) |
| 18 | — I can't start a run — Composer says a field is missing | present from last build | — |
| 19 | — My deploy never finishes and the gate looks stuck | present from last build | — |
| 20 | — My version endpoint isn't returning the new SHA after I push | present from last build | — |
| 21 | — The tester keeps failing the same criterion every iteration | present from last build | — |
| 22 | — My mission stopped before reaching a pass streak | present from last build | — |
| 23 | Changelog | present from last build | — (no image slots) |
| 24 | — Revision history | present from last build | — |
| 25 | — Incorporated improvements | present from last build | — |

## Per-slot verification — "Run your first mission" figure slots

All six figure slots sit inside section 4. Each row links a rendered-page
evidence capture (the live guide page scrolled to that slot, showing the real
image displayed in place) and a side-by-side comparison against the live
product UI at <https://dash.saniorem.com>. The two slots marked "previously
missing" are the former gap slots filled by the last build; this pass
confirms each now displays a real Ratchet UI capture on the live page.

| Step / slot | Asset (all 1440×900, HTTP 200) | Rendered on live guide page | Side-by-side vs live app |
| ----------- | ------------------------------ | --------------------------- | ------------------------ |
| Step 1 "Create a product shell" | `ratchet-guide-composer-product-shell-setup-opt.webp` | [rendered-step1-product-shell.png](https://raw.githubusercontent.com/southu/vygo/main/docs/evidence/ratchet-guide/rendered-step1-product-shell.png) | [side-by-side-product-shell.png](https://raw.githubusercontent.com/southu/vygo/main/docs/evidence/ratchet-guide/side-by-side-product-shell.png) — match: live composer shows the same IDENTITY / TARGET PROJECT / DEPLOY sections with name, repo, live_url, version_endpoint fields |
| Step 3 "Describe your goal" | `ratchet-guide-composer-goal-capture-opt.webp` | [rendered-step3-goal-capture.png](https://raw.githubusercontent.com/southu/vygo/main/docs/evidence/ratchet-guide/rendered-step3-goal-capture.png) | [side-by-side-goal-capture.png](https://raw.githubusercontent.com/southu/vygo/main/docs/evidence/ratchet-guide/side-by-side-goal-capture.png) — match: same GOAL section (mission field, acceptance criteria with Skip / + Add criterion) and BUILDER section |
| Step 4 "Accept the draft queue" | `ratchet-guide-composer-draft-queue-opt.webp` | [rendered-step4-draft-queue.png](https://raw.githubusercontent.com/southu/vygo/main/docs/evidence/ratchet-guide/rendered-step4-draft-queue.png) | [side-by-side-draft-queue.png](https://raw.githubusercontent.com/southu/vygo/main/docs/evidence/ratchet-guide/side-by-side-draft-queue.png) — match: same Mission queue panel, SKIPLINE priority order, AI assist panel, mission.yaml preview |
| Step 5 "Set your limits" | `ratchet-guide-composer-run-limits-opt.webp` | [rendered-step5-run-limits.png](https://raw.githubusercontent.com/southu/vygo/main/docs/evidence/ratchet-guide/rendered-step5-run-limits.png) | [side-by-side-run-limits.png](https://raw.githubusercontent.com/southu/vygo/main/docs/evidence/ratchet-guide/side-by-side-run-limits.png) — match: near-identical TESTER / HARNESS / LIMITS sections (max_iterations, consecutive_passes_required, max_budget_usd) |
| Step 6 "Start the run" (previously missing; filled by last build) | `ratchet-guide-composer-mission-control.png` | [rendered-step6-mission-control.png](https://raw.githubusercontent.com/southu/vygo/main/docs/evidence/ratchet-guide/rendered-step6-mission-control.png) | [side-by-side-mission-control.png](https://raw.githubusercontent.com/southu/vygo/main/docs/evidence/ratchet-guide/side-by-side-mission-control.png) — match: same mission.yaml preview pane with Copy, Download .md, Download .yaml, Run in Lazy Mode, and Save & Launch controls |
| Step 7 "Watch it iterate" (previously missing; filled by last build) | `ratchet-guide-dashboard-mission-timeline-opt.webp` | [rendered-step7-mission-timeline.png](https://raw.githubusercontent.com/southu/vygo/main/docs/evidence/ratchet-guide/rendered-step7-mission-timeline.png) | [side-by-side-mission-timeline.png](https://raw.githubusercontent.com/southu/vygo/main/docs/evidence/ratchet-guide/side-by-side-mission-timeline.png) — layout match: same header nav, ACTIVE RUNS panel, and Finished & aborted table (Mission / Status / Iter / Streak / Cost / Started / Updated columns). Note: at check time the live dashboard's `/api/runs` fetch returned an error banner, so no live run cards rendered; the guide asset is the documented sanitized demo-data render of this same view. The screen, layout, and key UI elements match. |

## Method

- Page + asset probes: `curl` against the live deployment (HTTP status,
  content-type, byte size); intrinsic dimensions decoded from the downloaded
  WebP/PNG headers.
- Rendered checks and captures: headless Chromium via Playwright, viewport
  1440×900 @ deviceScaleFactor 1, `networkidle` + settle before each shot —
  the same convention as the original capture set.
- Side-by-side composites: committed guide asset (left) vs same-day live
  capture of <https://dash.saniorem.com> (right), composed at equal width.
- No credentials, tokens, or operator data appear in any evidence file; live
  captures show only the public composer/dashboard views with empty or
  placeholder form values.

## Related documents

- Slot-level screenshot inventory (statuses `present` / `resolved` /
  `blocked`, stale-check outcomes):
  `apps/web/public/vibe-coding/ratchet-guide/screenshot-inventory.md`, served
  at <https://www.vygo.ai/vibe-coding/ratchet-guide/screenshot-inventory.md>
- Machine-readable slot inventory:
  <https://www.vygo.ai/content/ratchet-guide-assets/screenshot-inventory.json>
- Figure caption/prose drift tracker:
  <https://www.vygo.ai/vibe-coding/ratchet-guide-image-inventory>
