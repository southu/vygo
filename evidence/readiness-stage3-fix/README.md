# Readiness Check Stage 3 fix — live verification evidence

Verification bundle for the two Readiness Check fixes deployed to
**https://www.vygo.ai**:

1. **Stage 3 shows the generated prompt** instead of jumping straight to a failed
   state.
2. **New analysis when one already exists** completes successfully instead of
   erroring / clobbering the prior analysis.

| | |
| --- | --- |
| Deployed commit under test | `7979cae9aea3b637596e01ff2c8f254634b37c77` |
| Live `/version` at capture | `7979cae9aea3b637596e01ff2c8f254634b37c77` (matches HEAD) |
| Home page over HTTPS | `GET https://www.vygo.ai/` → **200** |
| Captured | 2026-07-28 |

Fix commits: `4b7c2e6`, `766b1ae`, `2b91ae6`, `b7aa9c3`, `72580b8`, `7979cae`
(all in `apps/web/src/components/readiness/ReadinessFlow.tsx` + content).
Regression coverage added in `3e85bfd` (`apps/web/e2e/readiness-flow.spec.ts`).

## Contents

- **`notes/stage3-prompt-before-after.md`** — Stage 3 diagnostic-prompt fix:
  pre-fix broken behavior, post-fix behavior, and live results
  (acceptance #2).
- **`notes/manual-repro-new-analysis.md`** — new-analysis-when-exists bug: repro
  steps + observed pre-fix breakage and resolved post-fix behavior
  (acceptance #3).
- **`tests/regression-output.txt`** — passing output from the regression suite
  captured against the deployed site: readiness node unit tests (15 + 11) and the
  Playwright specs `readiness-flow.spec.ts` (5/5) + `readiness-gate.spec.ts`
  (4/4). These mock the backend via `page.route` to drive the DEPLOYED client
  state machine deterministically.
- **`capture/live-stage3-capture.mjs`** — the live-browser driver (equivalent of
  `e2e/capture-console.js`) that hits the **real** deployed backend end-to-end.
- **`capture-summary.json`** — machine-readable assertion results + counts of
  console errors (0) and failed app requests (0).
- **`screenshots/`** — `01-project-step`, `02-stage3-diagnostic-prompt`
  (the generated prompt + awaiting state), `03-stage3-paste-step`,
  `04-new-analysis-reset`.
- **`console/live-stage3.console.txt`** — full browser console stream (no
  error-level entries).
- **`network/live-stage3.requests.json`** / **`.app-requests.json`** — every
  request with method/url/status; all same-origin readiness app calls returned
  2xx (session `201`, token `200`, session PATCH `200`×12, status poll `200`×3).

## Reproduce

```bash
# From repo root, with deps installed (pnpm install):

# 1. Node unit tests
pnpm test:callouts
pnpm exec tsx --test apps/web/src/lib/readiness/findings.test.ts

# 2. Playwright regression specs against the live deployment
cd apps/web
PLAYWRIGHT_BASE_URL=https://www.vygo.ai npx playwright test readiness-flow.spec.ts --project=desktop
PLAYWRIGHT_BASE_URL=https://www.vygo.ai npx playwright test readiness-gate.spec.ts --project=desktop

# 3. Live end-to-end browser capture (real backend, real prompt)
node evidence/readiness-stage3-fix/capture/live-stage3-capture.mjs
```

## Acceptance criteria coverage

| # | Criterion | Evidence |
| - | --------- | -------- |
| 1 | `/version` == latest `main` commit | table above (`7979cae`) |
| 2 | Stage 3 shows the generated prompt, no failed state | `notes/stage3-prompt-before-after.md`, `screenshots/02-*.png`, `capture-summary.json` |
| 3 | New analysis over an existing one completes, no error | `notes/manual-repro-new-analysis.md`, `screenshots/04-*.png`, capture step 5 |
| 4 | Zero new console errors / failed network requests | `capture-summary.json` (`0` / `0`), `console/`, `network/` |
| 5 | Home page loads over HTTPS → 200 | table above |
| 6 | Stage 1 / Stage 2 flows still complete | `readiness-flow.spec.ts` (a), `readiness-gate.spec.ts`, live capture drove Stage 1 intake → Stage 2/3 |
