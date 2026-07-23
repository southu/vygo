# TESTLOG — vygo-qa-uat-verification-pass, iteration 1

Full verification-and-evidence pass against the deployed site
`https://www.vygo.ai`, validating the four shipped QA & UAT content blocks:
(a) the Team/About **QA & UAT Lead** card (`/careers`), (b) the How-We-Work
**QA step** (`/method`), (c) the engagement-tier **deliverables bullets**
(`/pricing`, every tier), and (d) the **QA/UAT FAQ** entry (homepage).

This is a verification mission. Live content already matched the repository and
passed every acceptance criterion, so **no site content was changed**. The only
repository change is a new e2e content-lock spec plus captured evidence
artifacts. `version.txt` / the version endpoint are untouched.

**Deploy SHA baseline (pre-change):** `840bf4da20f75f26627a75714879b7ebefea499b`
(matched `GET /version` and `origin/main` HEAD when this baseline was recorded).

## Evidence captured (under `evidence/qa-uat-verification/`)

- `screenshots/` — 4 target locations × 2 viewports (~375px mobile, ~1280px
  desktop) = 8 headless-Chromium screenshots of the live site.
- `console/` — per-page console log + `document.documentElement.scrollWidth` +
  target-section boundingBox height for every capture.
- `dom/pricing-tier-bullet-counts.json` — rendered-DOM per-tier bullet counts.
- `dom/pricing-html-grep.txt` — production-HTML grep of the visible `<li>`
  deliverable bullets.
- `dom/rendered-sections.json` + `dom/text-checks.txt` — rendered innerText of
  the four blocks and the forbidden-term / optional-framing search results.
- `http-status.txt` — nav-page HTTP status + `/version` vs HEAD.
- `capture.mjs`, `text-checks.mjs`, `README.md` — reproducible scripts + summary.

## Change applied this iteration

Added `apps/web/e2e/qa-uat-copy.spec.ts` — a Playwright content-lock spec (5
tests) that asserts, against the rendered DOM:

1. `/careers` renders the QA & UAT Lead card with its approved summary and no
   workforce-location / optional-framing terms.
2. `/method` renders the QA step including its decision-gate phrase
   `not just developer-tested code`.
3. `/pricing` shows **both** QA/UAT bullets **exactly once in every tier**
   (`launch`, `scale`, `enterprise`).
4. The homepage FAQ expands to the QA/UAT answer containing
   `separate from the engineers writing the code`.
5. Both verbatim phrases survive in production content.

`pnpm typecheck`, `eslint`, and `prettier --check` pass on the new spec. The
spec passes against the live site (`5 passed`) and runs in CI against a local
build via the default Playwright `baseURL`.

## Acceptance criteria (verified against live)

| #   | Criterion | Result |
| --- | --------- | ------ |
| 1   | `GET /` returns HTTP 200 | 200 (see `http-status.txt`) |
| 2   | Team/About page 200 + QA & UAT Lead card content | 200; card + summary rendered |
| 3   | How-We-Work 200 + QA step copy | 200; QA step + activities rendered |
| 4   | Each of two QA/UAT bullets appears exactly once per tier, all tiers | 1× per tier × 3 tiers (rendered DOM) |
| 5   | FAQ served + QA/UAT entry answer present when expanded | Accordion expands to full answer |
| 6   | `not just developer-tested code` verbatim in production | Present (/method gate) |
| 7   | `separate from the engineers writing the code` verbatim | Present (homepage FAQ) |
| 8   | 0× `US-based`/`offshore`/`onshore`/`nearshore` in the 4 blocks | 0 occurrences (`text-checks.txt`) |
| 9   | No QA/UAT phrased as optional / add-on / extra-cost / tier-only | 0 occurrences; inclusive framing only |
| 10  | Screenshots for 4 locations at 375px and 1280px | 8 PNGs under `screenshots/` |
| 11  | 0 console error entries per page at both viewports | 0 errors on all 8 captures |
| 12  | No horizontal overflow; no collapsed target section | overflow 0px; heights all > 0 |
| 13  | e2e suite passes + asserts new QA & UAT copy | `qa-uat-copy.spec.ts`, 5 passed |
| 14  | Primary nav pages 200 with non-empty bodies | All 16 routes 200 (`http-status.txt`) |
| 15  | `/version` == tip of main after any push | Re-verified post-deploy |
