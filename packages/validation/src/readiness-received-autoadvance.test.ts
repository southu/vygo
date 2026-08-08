import assert from "node:assert/strict";
import { test } from "node:test";
import {
  receivedSignalOutcome,
  shouldRevealManualPastePrompt,
  type ReceivedSignalOutcome,
} from "./readiness-state.js";

// ---------------------------------------------------------------------------
// Regression: "received but stuck on the paste prompt".
//
// When a readiness report arrives and is persisted server-side (NOT via a manual
// paste), the flow must advance to the next step automatically with no manual
// paste input, and the copy-paste prompt for that step must not persist or
// reappear once the report has been received. The fallback paste prompt still
// shows (and works) ONLY when no report has been received before the timeout.
//
// These are the two authoritative decisions the web ReadinessFlow reads: the
// waiting-screen poll outcome (receivedSignalOutcome) and whether the manual
// paste prompt is revealed (shouldRevealManualPastePrompt). Locking their
// contract here means reverting the flow to the buggy "always show the paste
// prompt / never auto-advance" behaviour breaks these tests.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 1. A received + persisted report auto-advances with NO manual paste.
// ---------------------------------------------------------------------------

test("a received AND persisted report auto-advances to confirm with no manual paste", () => {
  const outcome: ReceivedSignalOutcome = receivedSignalOutcome({
    hasResults: true,
    persisted: true,
  });
  // "auto_confirm" is the branch that runs the same parse+confirm the manual
  // paste runs and lands on the Confirm-findings step — it does NOT stop on the
  // paste step and requires no manual paste input. This is the fix: pre-fix the
  // flow stayed on the paste prompt even though the report was already stored.
  assert.equal(outcome, "auto_confirm");
  assert.notEqual(outcome, "open_paste_step");
  assert.notEqual(outcome, "keep_waiting");
});

test("a landed but not-yet-persisted receipt at least opens the paste step (never stalls)", () => {
  // Older rollout / status-string-only fixture: results landed but the persisted
  // signal is absent. The flow must still LEAVE the waiting screen and open the
  // paste step automatically — it must not fabricate a confirmed parse, but it
  // also must not stay stuck waiting.
  assert.equal(receivedSignalOutcome({ hasResults: true, persisted: false }), "open_paste_step");
});

test("an empty receipt (no results bytes) keeps waiting rather than advancing", () => {
  // An accepted-but-still-processing /start run reports `received` with no
  // results yet; advancing on that would bounce the user off the waiting screen
  // before their AI sent anything.
  assert.equal(receivedSignalOutcome({ hasResults: false, persisted: true }), "keep_waiting");
  assert.equal(receivedSignalOutcome({ hasResults: false, persisted: false }), "keep_waiting");
});

// ---------------------------------------------------------------------------
// 2. Once a report has been received, the copy-paste prompt does NOT persist.
// ---------------------------------------------------------------------------

test("the manual paste prompt is hidden once a report has been received", () => {
  // A confirmed receipt ALWAYS hides the manual paste prompt — regardless of
  // whether the fallback timeout had elapsed or a token is still being polled.
  // Pre-fix this returned true (the prompt persisted), stranding the user on it
  // even though the report was already received and stored.
  assert.equal(
    shouldRevealManualPastePrompt({
      hasSubmissionToken: true,
      fallbackRevealed: false,
      resultsReceived: true,
    }),
    false,
  );
  // Even if the fallback timeout had already elapsed and revealed the prompt, a
  // report arriving afterwards must take the prompt back down — it must not
  // reappear once the report has been received.
  assert.equal(
    shouldRevealManualPastePrompt({
      hasSubmissionToken: true,
      fallbackRevealed: true,
      resultsReceived: true,
    }),
    false,
  );
  // And with no live token to poll, a received report still hides it.
  assert.equal(
    shouldRevealManualPastePrompt({
      hasSubmissionToken: false,
      fallbackRevealed: true,
      resultsReceived: true,
    }),
    false,
  );
});

test("while genuinely waiting on auto-detection the paste prompt stays hidden", () => {
  // Live token, timeout not yet elapsed, nothing received: only the waiting /
  // detection indicator shows — the paste prompt is NOT the default view.
  assert.equal(
    shouldRevealManualPastePrompt({
      hasSubmissionToken: true,
      fallbackRevealed: false,
      resultsReceived: false,
    }),
    false,
  );
});

// ---------------------------------------------------------------------------
// 3. Fallback: with NO report received before timeout, the paste prompt still
//    appears (and works). This is the correct, intentional behaviour for that
//    scenario only.
// ---------------------------------------------------------------------------

test("the fallback paste prompt appears when the timeout elapses with no report received", () => {
  // Bounded fallback timeout elapsed (fallbackRevealed) and nothing received:
  // reveal the manual paste prompt so the user can paste by hand.
  assert.equal(
    shouldRevealManualPastePrompt({
      hasSubmissionToken: true,
      fallbackRevealed: true,
      resultsReceived: false,
    }),
    true,
  );
});

test("the paste prompt is the only way forward when there is no token to auto-detect", () => {
  // No submission token means auto-detection cannot run at all, so the manual
  // paste prompt must be available immediately (still gated on nothing received).
  assert.equal(
    shouldRevealManualPastePrompt({
      hasSubmissionToken: false,
      fallbackRevealed: false,
      resultsReceived: false,
    }),
    true,
  );
});

// ---------------------------------------------------------------------------
// The two decisions compose to the end-to-end contract: a persisted report both
// auto-advances AND suppresses the paste prompt, while a timed-out no-report
// state does neither of those and falls back to the paste prompt.
// ---------------------------------------------------------------------------

test("persisted-report and timed-out-no-report scenarios are mutually exclusive end states", () => {
  // Report received + persisted: auto-advance, prompt suppressed.
  assert.equal(receivedSignalOutcome({ hasResults: true, persisted: true }), "auto_confirm");
  assert.equal(
    shouldRevealManualPastePrompt({
      hasSubmissionToken: true,
      fallbackRevealed: true,
      resultsReceived: true,
    }),
    false,
  );

  // No report before timeout: no auto-advance signal, fallback prompt shown.
  assert.equal(receivedSignalOutcome({ hasResults: false, persisted: false }), "keep_waiting");
  assert.equal(
    shouldRevealManualPastePrompt({
      hasSubmissionToken: true,
      fallbackRevealed: true,
      resultsReceived: false,
    }),
    true,
  );
});
