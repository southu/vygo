# Stage 3 diagnostic prompt — before / after

**This-iteration fix commit:** `153d086` — show the generated diagnostic prompt
on Stage 3 (paste results).
**Prior related commits:** `4b7c2e6`, `766b1ae`, `72580b8`, `7979cae` (never jump
Stage 3 to failed before the prompt is shown; three distinct Stage 2/3 states;
SSR paste-shell self-removes so the project step shows project selection only).
**Verified against:** https://www.vygo.ai — deployed commit `153d086`, 2026-07-28.

## The flow's stage labels (as rendered in the live UI)

The main readiness path renders these steps, in order:

1. **Project** — "Start — choose a project"
2. **Stage 1 of 3 — intake** (5 questions)
3. **Stage 2 of 3 — diagnostic prompt** — the tailored, generated prompt
   (`readiness-prompt-block`, beginning `VYGO READINESS DIAGNOSTIC PROMPT`).
4. **Stage 3 of 3 — paste results** — where the user pastes the report their AI
   produced from the prompt; post-submit it shows the parsed findings (confirm).

## Before (broken behavior)

The generated diagnostic prompt was rendered **only** on the **Stage 2 of 3 —
diagnostic prompt** view. When the flow advanced to the **Stage 3 of 3 — paste
results** screen, the prompt was gone: Stage 3 carried only the paste textarea
(and, after submit, the parsed findings). Driving the mission's acceptance path
(intake → continue → submit a valid VYGO-READINESS-REPORT v1) through to Stage 3
therefore found **no generated prompt text on the Stage 3 UI** — the prompt
appeared to "vanish" between Stage 2 and Stage 3.

## After (fixed behavior — this deploy, `153d086`)

The same generated prompt bundle is now surfaced **on the Stage 3 paste panel**
as a reference block: a heading ("Your diagnostic prompt" + tool name), a
re-copy button, and the full prompt in a code block
(`data-testid="readiness-stage3-prompt-block"`). It renders only when the prompt
bundle is available (intake complete), so the Stage 3 paste UI still works if it
is not. Stage 2 behavior, the paste/parse flow, the parse-failure raw fallback,
and the new-analysis reset paths are all unchanged.

- No change to the generated prompt schema, the analysis output shape, or the
  Stage 1/Stage 2 flows.
- The Stage 3 prompt text is byte-identical to the Stage 2 prompt
  (`promptMatchesStage2: true` below).

## After — live evidence (this run)

Driving the real deployed flow end-to-end (real backend session + freshly minted
submission token) to Stage 3 — `../capture/stage3-prompt-capture.mjs`,
`LIVE=1 BASE_URL=https://www.vygo.ai`:

| Assertion (`stage3-capture-summary.json`) | Result |
| ----------------------------------------- | ------ |
| `stage3PromptShown` (block contains the `VYGO READINESS DIAGNOSTIC PROMPT` header) | true |
| `stage3PromptLength`                      | 6629   |
| `promptMatchesStage2` (Stage 3 prompt == Stage 2 prompt) | true |
| `consoleErrorCount`                       | 0      |
| `appRequestCount`                         | 70     |
| `failedRequestCount`                      | 0      |

**Screenshots (this run):**
- `screenshots/capture-02-stage2-prompt.png` — the Stage 2 diagnostic-prompt view.
- `screenshots/capture-03-stage3-prompt.png` — the **Stage 3 of 3 — paste results**
  view, now showing the generated diagnostic prompt reference block above the
  paste textarea (the fix).

> Note on the "before" screenshot: the fix is already deployed to production, so
> the pre-fix state (Stage 3 with no prompt) can no longer be reproduced on the
> live site. The prior behavior is documented above; it is regression-covered by
> `apps/web/e2e/readiness-flow.spec.ts` group **(a)** — the new test
> "Stage 3 (paste results) also displays the generated diagnostic prompt" fails
> if Stage 3 regresses to not rendering `readiness-stage3-prompt-block`.

**Acceptance criterion #2 satisfied.**
