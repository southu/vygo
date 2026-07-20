# QA & UAT rollout — evidence package

Verification-first mission. This package documents end-to-end confirmation of the
completed QA & UAT rollout on the **live** site https://www.vygo.ai, captured on
**2026-07-20**.

## Deploy identity

- Repo `HEAD`: `2397aaa151f152d40804fdccab4f711ff8961545`
- Live `https://www.vygo.ai/version`: `2397aaa151f152d40804fdccab4f711ff8961545` (**match** — the live
  site serves the current HEAD, so every capture below reflects the deployed rollout).

This is a **no-change verification mission**: no source or content files were modified. The only
addition to the repo is this evidence package under `docs/evidence/qa-uat-rollout/`.

## Contents

```
docs/evidence/qa-uat-rollout/
├── README.md                     (this file)
├── overflow-report.json          layout/overflow probe at 375px & 1440px for every touched page
├── logs/
│   ├── deploy-verification.log   /version match + HTTP 200 sweep of touched + nav pages
│   ├── copy-guard.log            prohibited-framing scans (add-on/optional/upgrade/offshore/junior)
│   ├── pricing-verification.log  per-tier bullet consistency + pricing-figures-unchanged check
│   ├── build-web.log             passing `pnpm build:web` (Next.js) at deployed HEAD
│   └── lint.log                  passing `pnpm lint` (eslint) at deployed HEAD
└── screenshots/
    ├── team-desktop-1440.png     Team page @1440 — QA & UAT Lead card among existing cards
    ├── team-mobile-375.png       Team page @375
    ├── howwework-desktop-1440.png How We Work @1440 — QA & UAT stage (#4) in full process
    ├── howwework-mobile-375.png  How We Work @375
    ├── pricing-desktop-1440.png  Pricing @1440 (all tiers)
    ├── pricing-mobile-375.png    Pricing @375
    ├── tier-launch-card.png      Launch tier card — both QA/UAT bullets present
    ├── tier-scale-card.png       Scale tier card — both QA/UAT bullets present
    ├── tier-enterprise-card.png  Enterprise tier card — both QA/UAT bullets present
    ├── tier-{launch,scale,enterprise}.png  full-viewport context for each tier
    ├── faq-expanded.png          FAQ 'Who tests the software before launch?' expanded, non-empty answer
    ├── home-qa-blurb.png         Homepage built-in QA/UAT guarantee blurb
    └── home-{desktop-1440,mobile-375}.png  Homepage full-page (overflow reference)
```

Screenshots were captured with headless Chromium (Playwright) at `deviceScaleFactor: 2`
against the live site.

## Acceptance criteria → evidence

| # | Criterion | Evidence |
|---|-----------|----------|
| 1 | Home loads HTTPS 200 | `logs/deploy-verification.log` |
| 2 | `/version` 200 serves deployed SHA | `logs/deploy-verification.log` (HEAD == live) |
| 3 | Team page has 'QA & UAT Lead' card + existing cards | `screenshots/team-desktop-1440.png`, `team-mobile-375.png` |
| 4 | How We Work lists QA & UAT stage in full sequence | `screenshots/howwework-desktop-1440.png` (stages 1–7, QA/UAT is #4) |
| 5 | Every tier has both QA/UAT bullets, word-for-word identical | `screenshots/tier-*-card.png`, `logs/pricing-verification.log` |
| 6 | FAQ 'Who tests the software before launch?' expands to non-empty answer | `screenshots/faq-expanded.png` |
| 7 | Homepage contains QA/UAT blurb (present — no skip) | `screenshots/home-qa-blurb.png` |
| 8 | No QA-as-add-on/optional/extra/upgrade copy | `logs/copy-guard.log` §1–2 |
| 9 | No 'offshore'/'junior' in QA/testing/staffing context | `logs/copy-guard.log` §3 |
| 10 | Tier names + pricing figures unchanged | `logs/pricing-verification.log` |
| 11 | Touched pages render at 375px & 1440px, no overflow/clipping | `overflow-report.json` (0 overflow), mobile+desktop screenshots |
| 12 | Evidence dir contains all required captures + passing build log | this directory |
| 13 | No commit modifies version.txt / /version behavior | see note below |
| 14 | Nav links to all pre-existing pages, each 200 | `logs/deploy-verification.log` HTTP sweep |

## Notes for the tester

- **Where the FAQ lives**: the FAQ accordion (including 'Who tests the software before launch?')
  renders on the homepage `/`. Expanding the entry reveals the full answer — see `faq-expanded.png`.
- **Homepage blurb, not skipped**: criterion 7 is satisfied by presence. The guarantee line reads
  “Every build ships with independent QA sign-off and structured UAT—a dedicated QA & UAT Lead from
  day one, on every engagement.” No skip justification is required.
- **Per-tier bullets are byte-identical**: both `Structured UAT program — your team validates every
  feature before cutover` and `Independent QA sign-off on every release` appear once per tier
  (Launch/Scale/Enterprise), identical across all three. See the three `tier-*-card.png` captures.
- **Two 'junior' matches are pre-existing and benign**: the only 'junior' on any touched page is the
  home 'Senior-only delivery — No junior bench learning on the product.' reassurance. It asserts the
  *absence* of junior staff, predates the rollout (commit 35b6229), and is unrelated to the QA/UAT
  copy. Detail in `logs/copy-guard.log` §3.
- **version.txt untouched (criterion 13)**: no rollout commit and no mission commit modifies
  `version.txt` or the `/version` endpoint. The local `pnpm build:web` run used to produce
  `build-web.log` regenerated some provisioning/version artifacts as a build side-effect; those were
  reverted and are **not** included in any commit — only this `docs/evidence/` directory is added.

## Verification sweep result

All acceptance criteria pass against the live deploy. No horizontal overflow at 375px or 1440px on
home, Team, How We Work, pricing, or FAQ (`overflow-report.json`). No add-on/optional/paid-upgrade
framing of QA and no offshore/junior staffing language was introduced. No pre-existing tier name or
pricing figure changed. **No fix-up code changes were required.**
