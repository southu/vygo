# Stage 3 diagnostic prompt — before / after

**Fix commits:** `4b7c2e6` (never jump Stage 3 to failed before the prompt is
shown), `766b1ae` (three distinct Stage 2/3 states), `72580b8` + `7979cae`
(SSR paste-shell self-removes so the project step shows project selection only).
**Verified against:** https://www.vygo.ai — deployed commit `7979cae`, 2026-07-28.

## The Stage 3 (data-gathering / diagnostic-prompt) view

In the live UI this view is labelled **"STAGE 3 OF 3 — DIAGNOSTIC PROMPT"** and
renders the tailored, generated diagnostic prompt (`readiness-prompt-block`,
beginning `VYGO READINESS DIAGNOSTIC PROMPT`) plus an "awaiting your AI's results"
waiting panel and the "paste results instead" affordance.

### Before (broken behavior)

On a brand-new Readiness Check, the Stage 3 data-gathering step could flip
straight to the "results link expired" **failed state without ever showing the
generated prompt + awaiting-paste state**. Root cause: a just-minted submission
token can read back as unknown (`404 → expired`) for a beat while the mint write
becomes read-consistent, and the ingest poll trusted that first-poll "expired"
immediately. Separately, a Stage 2 prompt-generation failure fell through
silently to the Stage 1 view with no error, and the empty-paste / parse-failure
states were conflated.

### After (fixed behavior — this deploy)

- The expired→failed transition is guarded: only a token that could genuinely be
  stale (restored from a prior session's persisted draft, or already confirmed
  valid at least once this session) may honour an "expired" poll. A first-poll
  "expired" on a freshly minted token is treated as a transient read-after-write
  gap, so polling continues and the prompt + awaiting-paste state stays up.
- Three distinct, clearly-worded states now exist for prompt-generation failure,
  empty paste, and parse failure.
- No change to the generated prompt schema, analysis output shape, or the
  paste-step partial-parse fallback.

### After — live evidence (this run)

Driving the real deployed flow end-to-end (real backend session + freshly minted
submission token) to Stage 3 — `../capture/live-stage3-capture.mjs`:

| Assertion (`capture-summary.json`)        | Result |
| ----------------------------------------- | ------ |
| `promptBlockVisible`                      | true   |
| `promptContainsDiagnosticHeader`          | true   |
| `promptLength`                            | 6629   |
| `noExpiredFailedState`                    | true   |
| `awaitingStateShown`                      | true   |
| `pasteStepVisible`                        | true   |
| console errors / failed app requests      | 0 / 0  |

The three live status polls all returned `200` (pending) — never `404`/expired —
and the prompt rendered throughout. **Screenshot: `02-stage3-diagnostic-prompt.png`**
(shows the full "STAGE 3 OF 3 — DIAGNOSTIC PROMPT" view with the generated prompt
and the "waiting for your AI to send results back" awaiting state — no failed
state). `03-stage3-paste-step.png` shows the paste step after continuing.

> Note on "before" screenshot: the fix is already deployed to production, so the
> broken state can no longer be reproduced on the live site. The pre-fix behavior
> is documented above from the fix commits' root-cause analysis; the deterministic
> guard is regression-covered by `readiness-flow.spec.ts` group **(a)** (a
> regression would leave the prompt block absent / the view in the failed state).

**Acceptance criterion #2 satisfied.**
