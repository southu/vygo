# Verify-human first-run-fail / later-run-pass — Root Cause Analysis

**Status:** RCA + **implemented client-side fix** (see "Recommended fix
approach" → now shipped). The server Turnstile verifier, sitekey, and
`!turnstileToken` rejection are unchanged; only the client readiness gating was
corrected. Builds on the reproduction in
[`verify-human-flake-repro.md`](./verify-human-flake-repro.md).
**Date:** 2026-07-19 · **Revision:** builder HEAD (see `GET /version`).

## Root cause (one line)

The Submit control on the human-verification forms is **enabled and submittable
before the Cloudflare Turnstile token exists**, and the token is delivered only
by an **async widget callback**. A first (cold) submit inside that window fails
client validation with "Please complete the verification challenge."; a later
submit — after the callback has populated the token — passes with **no code
change and no reload**. This is a **client-layer render/callback race**, not a
server, cache, session, deploy, or test-order defect.

## Failing assertion → handler → component (traced)

The symptom surfaces at a client-side validation guard, before any network call:

1. **Assertion / guard that fails (WaitlistForm):**
   `apps/web/src/components/WaitlistForm.tsx:470-473` — `validateStep2()`:

   ```
   if (!turnstileToken) {
     next.turnstileToken = turnstileFailed
       ? "Verification is unavailable. Follow the fallback instructions below."
       : "Please complete the verification challenge.";
   }
   ```

   `validateStep2()` is the submit gate (`WaitlistForm.tsx:514` —
   `if (!validateStep2()) return;`). When `turnstileToken` is still `""`, submit
   returns early and **no POST to `/api/apply` is made** — matching the observed
   "first click does nothing but show the inline error."

2. **Why the token can be empty at click time — the async callback:**
   `apps/web/src/components/WaitlistForm.tsx:348-359` — the token is set **only**
   inside `window.turnstile.render(...)`'s `callback`:

   ```
   callback: (token: string) => {
     setTurnstileToken(token);
     ...
   }
   ```

   The widget script itself is injected **async** (`script.async = true`,
   `render=explicit`) at `WaitlistForm.tsx:382-388`, so `render()` and its
   `callback` only fire after the script downloads, the widget mounts, and the
   challenge resolves. Initial state is `useState("")` (`WaitlistForm.tsx:187`).

3. **Why the button lets the user click too early — no readiness gating:**
   `apps/web/src/components/WaitlistForm.tsx:1251` — the submit button is:

   ```
   disabled={status === "submitting"}
   ```

   It is disabled **only** while a request is in flight. There is **no**
   `disabled` / "verifying…" state tied to `turnstileToken` being empty, and
   **no** auto-submit or queued-submit once the callback fires. The whole
   token-issuance window is a live, clickable failure window.

4. **Identical defect in the readiness score gate (ScoreGateForm):**
   - Async callback sets token: `ScoreGateForm.tsx:154-156`.
   - Async script inject: `ScoreGateForm.tsx:179-183` (`script.async = true`).
   - Submit guard rejects empty token: `ScoreGateForm.tsx:211-212`
     (`next.turnstileToken = "Complete the verification challenge."`).
   - Submit button gated only on in-flight: `ScoreGateForm.tsx:455`
     (`disabled={status === "submitting"}`).

   Same shape, same race, same first-fail/retry-pass symptom on
   `POST /v1/readiness/score`.

## Why "later run passes" — and why it is not the other suspects

- **Later-run pass:** between the failed first click and the retry, the async
  `callback` runs `setTurnstileToken(token)` (`WaitlistForm.tsx:351` /
  `ScoreGateForm.tsx:155`), which also clears the field error. The next submit
  passes `validateStep2()` and reaches the server. Purely the passage of time
  for the async widget — no reload, no code change. This is the classic
  "flaky-on-cold, green-on-warm" signature.
- **Not server-side:** `apps/api/src/services/turnstile.ts`
  (`CloudflareTurnstileVerifier.verify`, lines 42-67) is fail-closed and
  deterministic — empty token → `{ success:false, reason:"missing" }`; a valid
  token → success. Enforced at `POST /v1/readiness/score`
  (`apps/api/src/routes/readiness.ts:2386-2390`). It never "warms up," so it
  cannot explain first-fail/later-pass. The client rejects before it is even
  reached.
- **Not cache / session / cookie bootstrap:** no session or cookie is read on
  the failing path; the guard is a pure function of local React state
  (`turnstileToken` / `turnstileFailed`).
- **Not deploy lag:** the SHA is stable across the fail and the pass; the retry
  succeeds against the _same_ deployed revision.
- **Not test order dependence:** the race is intra-interaction (one form
  instance), independent of any other test.

## Why CI/e2e never catches it (test-coverage gap, not the bug)

`apps/web/e2e/helpers.ts:57-63` — `installTurnstileStub()` issues the token
**synchronously** on `render()`:

```
// Immediate token so validation never races the stub.
```

This removes the exact async gap that bites real users, so e2e is always green.
Unit/integration tests inject `PassThroughTurnstileVerifier`
(`apps/api/src/services/turnstile.ts:20-24`), which also never exercises the
client timing. The flake is therefore **structurally invisible** to the current
suite — a coverage gap that masks a live defect.

## Evidence summary (from the repro, re-confirmed against code)

- Real managed Turnstile widget vs a headless bot: cold automated runs
  consistently fail (bot cannot solve a _managed_ challenge) — confirms the gate
  is present, enforced, and reachable on live without secrets, but is a harness
  artifact, not the user flake.
- Isolated app-layer race (inject `window.turnstile` whose `callback` fires
  after a fixed 1200 ms, exactly mimicking a real human's late token): **every**
  fresh cold session reproduces first-attempt fail → later retry pass,
  deterministically. That is the reported flake, and it lands precisely on
  `validateStep2()` / the `ScoreGateForm` guard above.

## Fix approach (implemented)

Goal: make the human-verification forms **never present a submittable state that
is guaranteed to fail**, and recover automatically once the token arrives.

**Shipped implementation:** both forms now **queue one submit** when the user
clicks before the Turnstile token is issued (token empty, not failed). The click
is recorded (`pendingSubmitRef`), the button shows a disabled "Verifying you're
human…" affordance with `aria-busy`, and the submit **auto-fires from the token
callback** the moment the token lands — so the first cold click succeeds with no
second user retry. A failed widget still blocks with the existing fallback
instructions; a queued submit is cancelled if the widget errors. The e2e harness
gained a delayed-token stub (`installDelayedTurnstileStub`) plus a regression
test that reproduces the async gap and asserts the single click succeeds.
Changed: `WaitlistForm.tsx`, `readiness/ScoreGateForm.tsx`, `e2e/helpers.ts`,
`e2e/waitlist-form.spec.ts`. The design intent below is retained for reference.

### Follow-up: the queue could hang forever when the callback never fires

The queue fix above assumed the token eventually arrives (late, but arrives).
Production surfaced a stricter cold failure: `window.turnstile` is defined,
`render()` returns a widget id, **but the callback never fires at all** — no
token, and no `error-callback` either (no visible challenge iframe, PAT calls
401). In that state the queued submit had nothing to auto-fire it, and the
existing safeguards did not help: the 8s script-load timer
(`WaitlistForm.tsx`) only trips when `window.turnstile` is **absent**, and the
`turnstileFailed` cancel effect only fires on an explicit widget error. So the
button sat on a disabled **"Verifying you're human…"** indefinitely — the exact
infinite-pending state the tester reproduced twice in fresh cold contexts.

**Shipped:** a **bounded timeout** (`PENDING_TOKEN_TIMEOUT_MS = 10s`) on the
queued-submit wait in both forms. If no token lands within the window, the form
exits the pending state into the existing actionable affordance — the
`turnstile-fallback` panel plus a `turnstileToken` field error — instead of an
infinite spinner, and re-enables Submit for a retry. 10s sits comfortably above
the ~1–2s a real widget takes to auto-issue a token (so a legitimate challenge
is never cut off) and below the ≥20s that defines the "stuck" failure. No
empty-token POST is ever made, so the soft-accept server path is not reached as
a false success. In `WaitlistForm` the timeout sets a dedicated
`verificationTimedOut` flag (not `turnstileFailed`) because that form's render
effect re-runs on `status` changes and resets `turnstileFailed`, which would
otherwise silently clear the fallback; `ScoreGateForm`'s render effect does not
depend on `status`, so it reuses `turnstileFailed`.

Coverage: `installStuckTurnstileStub` (render returns an id, callback never
fires) plus two independent cold-context tests per form asserting the timeout
reaches the fallback terminal state — they fail if the infinite-pending state,
an empty-token false success, or warm-path-only success returns. Changed:
`WaitlistForm.tsx`, `readiness/ScoreGateForm.tsx`, `e2e/helpers.ts`,
`e2e/waitlist-form.spec.ts`, `e2e/readiness-gate.spec.ts`.

1. **Track verification readiness explicitly.** Add a small state, e.g.
   `turnstileStatus: "loading" | "ready" | "error"` in both `WaitlistForm` and
   `ScoreGateForm`, set to `ready` inside the Turnstile `callback` (alongside
   `setTurnstileToken`), `error` in `error-callback`, and reset to `loading` on
   (re)mount / expiry.

2. **Gate the Submit button on readiness, not just in-flight.** Change
   `WaitlistForm.tsx:1251` and `ScoreGateForm.tsx:455` from
   `disabled={status === "submitting"}` to also disable while
   `turnstileStatus === "loading"` (i.e. token not yet issued and not in the
   error/fallback state), with a visible "Verifying you're human…" affordance
   and `aria-busy`. This closes the click-too-early window without weakening the
   gate. Preserve the existing fallback path so `turnstileFailed`/`error` still
   shows the manual-verification instructions rather than an indefinitely
   disabled button.

3. **(Optional, better UX) Queue one submit.** If the user clicks while
   `loading`, record intent and auto-fire the submit from the token `callback`
   once `ready`, so a single early click still succeeds instead of erroring.

4. **Close the coverage gap.** Give the e2e harness a delayed-token mode (a
   `installTurnstileStub(page, { delayMs })` variant) that fires the callback
   after a timeout, and add a test asserting Submit is disabled until the token
   lands and enabled/auto-submits after — so the race is covered in CI instead
   of masked by the synchronous stub.

**Do not** change the server verifier, the Turnstile sitekey, or the
`!turnstileToken` server-side rejection — those are correct and fail-closed. The
fix is entirely in client-side readiness gating.

## Blast radius / affected files

- `apps/web/src/components/WaitlistForm.tsx` (submit gate + button, lines
  ~187, 348-359, 382-388, 470-473, 514, 1251).
- `apps/web/src/components/readiness/ScoreGateForm.tsx` (lines ~101, 154-156,
  179-183, 211-212, 455).
- `apps/web/e2e/helpers.ts` (delayed-token test mode, lines ~57-63) — test-only.
- No server or infra change required.

## Live health at this revision (regression)

- `GET https://www.vygo.ai/` → 200, non-empty HTML (home chrome present).
- `GET /version` → deployed SHA; matches builder HEAD after push.
- `GET /readiness` → 200; `POST /v1/readiness/score-preview` → 200 (no Turnstile,
  no PII) exercises the non-verify-human path.
- Verify-human gate reachable on live (`turnstile-region` in the waitlist modal;
  real managed Turnstile challenge) with no secret or vault token used.
