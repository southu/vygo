# Verify-human flake — reproduction note

**Status:** investigation only (no product fix in this mission — the verify-human
success criteria and Turnstile gating are deliberately left unchanged).
**Date:** 2026-07-19 · **Revision:** builder HEAD (see `GET /version`).

## TL;DR

"Verify-human" on Vygo is the **Cloudflare Turnstile** ("verify you are human")
challenge that gates the waitlist/apply modal (`WaitlistForm`) and the Readiness
score gate (`ScoreGateForm`). The reported flake — _first submit fails, a couple
of retries later it succeeds with no code change_ — reproduces and is a
**client/app-layer race**: the Submit button is live before the Turnstile token
exists, so an early first click fails the client-side check
("Please complete the verification challenge."), and a retry after the widget's
async callback fires passes. It is **live-facing** (the same code ships to
www.vygo.ai) but is a **timing race, not a server or deploy defect**.

## What "verify-human" is (paths)

- Client widget + gate:
  - `apps/web/src/components/WaitlistForm.tsx` — step-2 `turnstile-region`;
    loads `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`,
    renders the widget, and stores the issued token in React state
    (`turnstileToken`). Submit calls `validateStep2()`, which rejects an empty
    token (`WaitlistForm.tsx:470`). The submit button is `disabled` **only** when
    `status === "submitting"` (`WaitlistForm.tsx:1251`) — never while the token
    is still pending.
  - `apps/web/src/components/readiness/ScoreGateForm.tsx` — identical gate
    (`if (!turnstileToken) next.turnstileToken = "Complete the verification challenge."`,
    `ScoreGateForm.tsx:211`).
- Server verify: `apps/api/src/services/turnstile.ts`
  (`CloudflareTurnstileVerifier`), enforced by `POST /v1/readiness/score`
  (`apps/api/src/routes/readiness.ts`). Server-side is fail-closed and is _not_
  the flaky layer.
- Test harness: `apps/web/e2e/helpers.ts` → `installTurnstileStub()` issues a
  token **synchronously** ("Immediate token so validation never races the
  stub."). This is why CI/e2e never sees the flake — the harness removes the very
  race that bites real users. Unit tests use DI `PassThroughTurnstileVerifier`.

## Symptom

On step 2 of the waitlist/apply modal (or the readiness email gate), the user
clicks **Submit** and sees an inline error under the verification region:

> Please complete the verification challenge.

(`data-field-error="turnstileToken"`). The form does not submit. Waiting a
moment and clicking again (once the Turnstile widget has finished loading and
called back with a token) submits successfully. No code changes, no reload
required.

## Exact repro steps

Prerequisite: a real browser session (the production widget uses a **real
managed** Turnstile sitekey, not the always-pass test key — see harness note).

1. Open https://www.vygo.ai/apply in a fresh session (clear cookies/storage).
2. Availability resolves client-side to `waitlist`; click the primary CTA
   (`[data-cta-mode="waitlist"]`, "Apply for the next opening") to open the
   `WaitlistForm` modal.
3. Fill step 1 (name, work email, company, product URL) and click **Continue**.
4. On step 2, fill stage / primary blocker / start window / message and accept
   the privacy checkbox, then **immediately** click **Submit** — before the
   Turnstile widget in `turnstile-region` has visibly finished.
5. Observe **first attempt fails**: inline "Please complete the verification
   challenge." and no network POST to `/api/apply`.
6. Wait ~1–3 s for the widget to issue its token, click **Submit** again →
   **succeeds** (201 / success card).

The narrower the network/CPU (cold cache, first paint, slow Turnstile script
fetch), the wider the fail window and the more retries needed.

## Cold-run evidence (live, fresh process + session each run)

Harness: headless Chromium via `playwright-core`, one fresh browser process and
fresh context per run against live www.vygo.ai. Two complementary experiments:

### A. Real production widget (unmodified)

3 cold runs, each a fresh session driving the real modal to step 2 and retrying
Submit for 20 s:

| run | first attempt                | verdict over 20 s       | widget                 |
| --- | ---------------------------- | ----------------------- | ---------------------- |
| 1   | fail: verify-human-not-ready | **fail (never passed)** | real managed challenge |
| 2   | fail: verify-human-not-ready | **fail (never passed)** | real managed challenge |
| 3   | fail: verify-human-not-ready | **fail (never passed)** | real managed challenge |

The live widget mounts a **real managed Turnstile challenge** (iframe
`https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile/f/av0/…`),
which does **not** auto-issue a token to a headless bot. So automated cold runs
**consistently fail** — this is a _harness artifact_ (bot ≠ human), not the
reported user flake. It does confirm the verify-human gate is present, enforced,
and reachable on live without secrets.

### B. App-layer race isolated (controlled token latency)

To reproduce the actual human symptom while controlling for the bot confound, the
real widget's async token issuance is simulated by injecting a `window.turnstile`
whose `callback` fires after a fixed delay (1200 ms) — i.e. exactly what a real
human's widget does, just deterministically. Fresh session per run; apply POST
mocked so retries write no real rows:

| run | first attempt                    | later retry | attempts to pass |
| --- | -------------------------------- | ----------- | ---------------- |
| 1   | **fail**: verify-human-not-ready | **pass**    | 6                |
| 2   | **fail**: verify-human-not-ready | **pass**    | 6                |
| 3   | **fail**: verify-human-not-ready | **pass**    | 6                |

Every fresh cold session reproduces **first-attempt failure followed by later
success with no code change** — deterministic once the token is late. This is the
reported flake.

Reproduce locally:

```
cd /tmp && npm i playwright-core   # browsers already cached
# A: real widget (expect consistent fail in headless)
RUNS=3 node coldrun.js
# B: isolated race (expect first-fail -> retry-pass)
RUNS=3 DELAY=1200 node coldrun-race.js
```

(The two harness scripts used for this note live under the mission scratch dir;
they drive only public pages and mock the apply POST — no secrets, no real data.)

## First-run vs retry behavior

- **First run / first click:** the submit path is enabled before
  `turnstileToken` is set, so `validateStep2()`/`ScoreGateForm` submit rejects
  with "Please complete the verification challenge." No server call is made.
- **Later runs / retries:** the Turnstile `callback` has since populated the
  token (`setTurnstileToken(...)`), clearing the field error; the next Submit
  passes client validation and reaches the server verifier. Success needs no
  reload and no code change — purely the passage of time for the async widget.
- The gap is invisible in CI/e2e because `installTurnstileStub()` issues the
  token synchronously, and unit tests inject a pass-through verifier.

## Suspected layer

**Primary: app (client) layer.** The submit control does not gate on
verification readiness — there is no "waiting for verification…" disabled state
and no auto-submit/queue once the token arrives. The Turnstile script is loaded
async (`render=explicit`) and the token arrives only via callback, so any submit
inside that window fails and a retry outside it succeeds. Same pattern in both
`WaitlistForm` and `ScoreGateForm`.

**Secondary / aggravating: deploy readiness + network.** A cold first hit after a
fresh deploy (uncached Turnstile script, first-paint hydration, cold edge) widens
the token-issuance window, making the first-attempt failure more likely right
after a release. This amplifies the race but is not the root cause.

**Not the cause: harness and server.** The server verifier is fail-closed and
deterministic; unit/integration tests pass. The e2e harness _masks_ the flake
(synchronous stub token) rather than exhibiting it — a test-coverage gap, not the
bug. Headless automation against the real widget consistently fails for an
unrelated reason (managed challenge won't solve for a bot).

## Regression / health check (this revision)

- `GET https://www.vygo.ai/` → 200 (HTTPS).
- `GET /version` → deployed SHA, matches builder HEAD after push.
- `GET /readiness` → 200; `POST /v1/readiness/score-preview` → 200 (~0.5 s).
- Verify-human gate reachable on live (`turnstile-region` in the waitlist modal,
  real managed Turnstile challenge) without any secret or vault token.

## Suggested follow-up (out of scope here — do not implement in this mission)

- Disable Submit (or show "verifying…") until `turnstileToken` is set / the
  widget has loaded, and/or auto-submit once the token callback fires.
- Give the e2e harness a delayed-token mode so the race is covered in CI instead
  of masked by a synchronous stub.
