# Per-screenshot validation checklist

Verified against the **live** guide at
<https://www.vygo.ai/vibe-coding/ratchet-guide> on **2026-07-22** (deployed SHA
`e4691432f7b14f71da90f2d3b57cec3c7467fefa`). Raw probe: `live-verification-probe.txt`.

Checks per row (mirror the mission acceptance criteria):

- **200 image/**: served asset returns HTTP 200 with `Content-Type: image/*`.
- **Fresh**: `Last-Modified`/`ETag` dated on or after 2026-07-22 — no stale file
  served under an old name.
- **1440×900**: served WebP decodes to the one shared width×height.
- **alt**: the `<img>` has a non-empty `alt` attribute.

## Captured slots — all PASS

| Slot | Served asset | 200 image/webp | Fresh (Last-Modified) | 1440×900 | Non-empty alt | Result |
| ---- | ------------ | :---: | ---- | :---: | :---: | :---: |
| fig-01-product-shell-setup | `ratchet-guide-composer-product-shell-setup-opt.webp` | ✅ | ✅ Wed, 22 Jul 2026 12:14:17 GMT | ✅ 1440×900 | ✅ | **PASS** |
| fig-02-goal-capture | `ratchet-guide-composer-goal-capture-opt.webp` | ✅ | ✅ Wed, 22 Jul 2026 12:02:46 GMT | ✅ 1440×900 | ✅ | **PASS** |
| fig-03-draft-queue | `ratchet-guide-composer-draft-queue-opt.webp` | ✅ | ✅ Wed, 22 Jul 2026 12:02:46 GMT | ✅ 1440×900 | ✅ | **PASS** |
| fig-04-run-limits | `ratchet-guide-composer-run-limits-opt.webp` | ✅ | ✅ Wed, 22 Jul 2026 12:02:47 GMT | ✅ 1440×900 | ✅ | **PASS** |

**Dimension consistency:** all four captured assets decode to the single shared
resolution **1440×900** (device-scale-factor 1). ✅

**`alt` text** (all non-empty, describing the depicted UI state + key controls):

- fig-01 — "Composer product shell setup page showing the Git remote, Live URL, and Version endpoint fields"
- fig-02 — "Composer goal capture page showing the Goal and Constraints input fields"
- fig-03 — "Composer draft queue page showing the proposed step list and the Accept draft button"
- fig-04 — "Composer run limits page showing the Max iterations, Pass streak, and Spend cap fields"

## Flagged slots — no served `<img>`, deferred (see `follow-ups.md`)

| Slot | Renders | Served asset | Reason |
| ---- | ------- | ------------ | ------ |
| fig-05-mission-control | frame-only placeholder (no `<img>`) | none (404 by design) | Guide depicts a "Start run" button on a mission-control screen; the live composer has no such control (commit via Enqueue / Save & Launch; Pause/Resume live on `/queue`). No 1:1 UI to capture. |
| fig-06-mission-timeline | frame-only placeholder (no `<img>`) | none (404 by design) | Guide depicts a per-iteration build / deploy-gate / test timeline; the live `/dashboard` surfaces only an Active-runs table, and its runs data is control-plane-gated (authenticated render would expose operator PII). No clean sanitized timeline is capturable. |

Flagged slots are **out of scope for figure re-capture** in this mission and are
recorded in `follow-ups.md` for a separate guide-text revision mission. They do
**not** render an `<img>`, so they are not subject to the image acceptance
criteria.

## Page-level checks — PASS

| Check | Result |
| ----- | :---: |
| Guide `GET /vibe-coding/ratchet-guide` → HTTP 200 | ✅ 200 |
| Guide source retains main title ("Ratchet system guide") and all section headings | ✅ (Get set up · Understand what Ratchet does · Run your first mission · Run the build, deploy, and test loop · Go further with advanced usage · Troubleshooting & FAQ · Changelog) |
| Every guide `<img>` returns HTTP 200 + `image/*` | ✅ (4/4) |
| Every guide `<img>` has non-empty `alt` | ✅ (4/4) |
| Refreshed screenshots share one width×height | ✅ 1440×900 |
| Regression: home `GET /` → HTTP 200 | ✅ 200 |
| Regression: `GET /version` → HTTP 200 + deployed SHA | ✅ 200, `e4691432f7b14f71da90f2d3b57cec3c7467fefa` |

**All captured rows pass; no figure required re-capture.**
