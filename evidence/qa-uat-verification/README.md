# QA & UAT verification-pass evidence

Verification-and-evidence pass against the live deployment
`https://www.vygo.ai`, validating the four shipped QA & UAT content blocks.
All checks below were captured from the **live production site**; no site
content changes were required — the only repo change this pass is a new e2e
content-lock spec (`apps/web/e2e/qa-uat-copy.spec.ts`).

Baseline deployed SHA at capture time: `840bf4da20f75f26627a75714879b7ebefea499b`
(matched `GET /version` and `origin/main` HEAD).

## How to reproduce

```bash
cd apps/web
PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright \
  node ../../evidence/qa-uat-verification/capture.mjs      # screenshots + console + DOM
node ../../evidence/qa-uat-verification/text-checks.mjs     # forbidden-term / optional-framing search
LIVE_URL=https://www.vygo.ai node_modules/.bin/playwright test qa-uat-copy --project=desktop
```

## Artifacts

| File | Evidence item |
| ---- | ------------- |
| `screenshots/*.{mobile,desktop}.png` | Item 1 / AC10 — 4 target locations × 2 viewports (375px, 1280px) |
| `console/*.console.txt` | Item 1 / AC11–12 — per-page console log, scrollWidth, section height |
| `dom/pricing-tier-bullet-counts.json` | Item 2 / AC4 — both bullets exactly once per tier (rendered DOM) |
| `dom/pricing-html-grep.txt` | Item 2 — visible server-rendered `<li>` count = 3 (one per tier) |
| `dom/rendered-sections.json` | Item 4 — rendered innerText of all four blocks |
| `dom/text-checks.txt` | Items 3 & 5 / AC8–9 — forbidden-term + optional-framing search |
| `http-status.txt` | AC1, AC14, AC15 — nav-page HTTP 200 + `/version` == HEAD |
| `capture-summary.json` | Machine-readable roll-up of every capture |
| `capture.mjs`, `text-checks.mjs` | Reproducible capture + check scripts |

## Results summary

**Screenshots & rendering (AC10–12)** — 4 targets × 2 viewports = 8 screenshots.
Every capture: **0 console error-level entries**, `scrollWidth == viewport`
(0px horizontal overflow), and a non-zero target section height:

| Target | mobile (375) | desktop (1280) |
| ------ | ------------ | -------------- |
| (a) Careers QA & UAT Lead card | errs 0 / overflow 0 / h 336.9 | errs 0 / overflow 0 / h 315.6 |
| (b) Method QA step | errs 0 / overflow 0 / h 924.3 | errs 0 / overflow 0 / h 376.0 |
| (c) Pricing tier deliverables (Scale) | errs 0 / overflow 0 / h 634.2 | errs 0 / overflow 0 / h 637.1 |
| (d) FAQ QA/UAT (expanded) | errs 0 / overflow 0 / h 339.5 | errs 0 / overflow 0 / h 193.2 |

**Per-tier bullets (AC4)** — rendered DOM shows each of the two bullets
("Structured UAT program …" and "Independent QA sign-off on every release")
exactly **once** in each of the `launch`, `scale`, and `enterprise` tiers.
Visible server-rendered `<li>` count = 3 each (one per tier).

**Verbatim phrases (AC6, AC7)** — both present in production:
- `not just developer-tested code` — /method QA step decision gate
- `separate from the engineers writing the code` — homepage QA/UAT FAQ answer

**Forbidden workforce-location terms (AC8)** — 0 occurrences of `US-based`,
`offshore`, `onshore`, `nearshore` (case-insensitive) across all four blocks.

**Optional / add-on / extra-cost / tier-restricted framing (AC9)** — 0
occurrences across all four blocks. Note: the only `Optional` token elsewhere on
`/method` is the "Ops continuity" cell of the tier-comparison matrix (about
post-launch vygo Ops, **not** QA/UAT); the QA/UAT copy uses only inclusive
framing ("Every engagement includes…", "on every release", "never billed
separately", "standard part of every project").

**HTTP regression (AC1, AC14, AC15)** — all 16 checked routes return HTTP 200
with non-empty bodies; `GET /version` returns the deployed SHA which matched
`origin/main` HEAD.

**e2e content lock (AC13)** — `apps/web/e2e/qa-uat-copy.spec.ts` adds 5 tests
asserting the four blocks + both verbatim phrases; all pass against the live
site (`5 passed`). Runs in CI against a local build via the default Playwright
`baseURL`.
