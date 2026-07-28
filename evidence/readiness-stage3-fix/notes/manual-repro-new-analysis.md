# Manual repro — "new analysis when one already exists" bug

**Fix commits:** `2b91ae6`, `b7aa9c3` (ReadinessFlow.tsx `?new=1` isolation +
synchronous prior-draft clear).
**Verified against:** https://www.vygo.ai — deployed commit `7979cae`
(live `/version` == `7979cae`), captured 2026-07-28. Re-confirmed still holding
at deploy `153d086` (the Stage 3 prompt-display fix) — that change does not touch
the `?new=1` isolation or prior-draft-clear paths; regression spec group **(b)**
passes at `153d086` (see `../tests/regression-output.txt`).

## What the bug was

Starting a NEW Readiness Check analysis while a prior analysis already existed
for the same input (reached either via the in-page "New analysis" control or the
`/readiness?new=1` entry point) did not start cleanly. Two coupled defects:

1. **Session reuse / data loss (`2b91ae6`).** `?new=1` resumed the prior session
   token (`?token=` or the persisted local token) whenever a prior analysis
   existed, and reused that same `readiness_sessions` row for the new run.
   Because a draft PATCH replaces the whole draft, `startRun()`'s persist then
   overwrote the earlier analysis's session draft — data loss — and until that
   persist ran, the reused token still carried the prior stage1/paste/confirm
   draft.

2. **Stale-state leak (`b7aa9c3`).** The `?new=1` handoff only repointed
   `localStorage` (`vygo:readiness:v1`) at the fresh session AFTER the
   `createReadinessSession()` network round-trip resolved. For the whole
   duration of that round-trip the just-completed run's local draft — its
   Stage 3 paste text, parsed findings, project label and session token — stayed
   fully readable, so the prior analysis's state was visible during the
   new-analysis load, and a plain reload mid-flight could resurrect it into the
   "new" run.

### Pre-fix reproduction steps (broken behavior)

1. Complete a Readiness Check to the diagnostic-prompt / paste stage so a prior
   analysis exists in the local draft (`vygo:readiness:v1`).
2. Trigger a new analysis over it — click "New analysis", or open
   `/readiness?new=1` (the link the completed-snapshot "new analysis" control
   uses).
3. **Observed pre-fix:** the "new" run booted showing the PRIOR analysis's
   prompt/paste state instead of a clean project step; a reload during the
   session round-trip resurrected the old draft; and the new run's first persist
   overwrote (destroyed) the prior analysis's saved session draft. Net effect for
   the user: starting a second analysis errored out / clobbered the first instead
   of completing successfully.

### Post-fix resolved behavior

Root-cause fix: a new analysis now (a) clears the prior local draft
**synchronously** at the very start of the `?new=1` branch — before any network
round-trip — and (b) always creates a **fresh, isolated** session row instead of
resuming the prior token, repointing local persistence at it. The prior
session/draft and the durable `analyses`/snapshot rows stay intact and readable
(the completed analysis remains available via `/analyses`); the new run starts
from a genuinely empty intake draft.

### Post-fix verification (live, this run)

Automated in the live-browser capture (`../capture/live-stage3-capture.mjs`,
step 5) and the regression spec (`readiness-flow.spec.ts` group **(b)**), both
run against the deployed site:

- Triggering "New analysis" over a just-generated analysis resets to the project
  step with **no stale prompt** (`readiness-stage2` / `readiness-prompt-block`
  count == 0) and **no stale paste** (`readiness-paste-textarea` count == 0).
  See `capture-summary.json`: `noStalePromptAfterReset: true`,
  `noStalePasteAfterReset: true`; screenshot `04-new-analysis-reset.png`.
- The `?new=1` entry point with a seeded prior-analysis local draft lands on the
  fresh project step and never renders the prior paste text (spec (b) case 2).
- A second run then starts cleanly from an empty Stage 1 and reaches its own
  fresh prompt (spec (b) case 1; capture reached the prompt with a real backend
  session, all app requests 2xx — see `network/live-stage3.app-requests.json`).

No error is thrown and the new analysis completes to the diagnostic-prompt stage
successfully. **Acceptance criterion #3 satisfied.**
