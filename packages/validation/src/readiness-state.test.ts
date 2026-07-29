import assert from "node:assert/strict";
import { test } from "node:test";
import {
  READINESS_STATES,
  BACKGROUND_FORBIDDEN_STATES,
  applyBackgroundCompletion,
  backgroundCompletionMayEnter,
  missionCallbackMatchesRun,
  guardMissionCallback,
  canTransition,
  entryReadinessState,
  freshReadinessRun,
  hydrateReadinessState,
  isParseFailureStatus,
  isReadinessState,
  nextReadinessState,
  parseReachesReportParsed,
  persistedStageForState,
  readinessStateOrder,
  shouldRestorePersistedReadinessRun,
  stateAfterParse,
  type ReadinessState,
} from "./readiness-state.js";

// ---------------------------------------------------------------------------
// Ordered stages (acceptance: prompt displayed → user ready to paste → report
// pasted → report parsed → findings confirmed, with no skipped stage).
// ---------------------------------------------------------------------------

test("the canonical progression is ordered with no skipped stage", () => {
  assert.deepEqual(READINESS_STATES, [
    "intake",
    "prompt_displayed",
    "user_ready_to_paste",
    "report_pasted",
    "report_parsed",
    "findings_confirmed",
  ]);
  // Strictly increasing ordinals, one per state.
  const orders = READINESS_STATES.map((s) => readinessStateOrder(s));
  assert.deepEqual(orders, [0, 1, 2, 3, 4, 5]);
});

test("isReadinessState guards unknown strings", () => {
  assert.equal(isReadinessState("report_parsed"), true);
  assert.equal(isReadinessState("nonsense"), false);
  assert.equal(isReadinessState(null), false);
});

// ---------------------------------------------------------------------------
// Legal transitions.
// ---------------------------------------------------------------------------

test("each forward step in the progression is a legal transition", () => {
  assert.equal(canTransition("intake", "prompt_displayed"), true);
  assert.equal(canTransition("prompt_displayed", "user_ready_to_paste"), true);
  assert.equal(canTransition("user_ready_to_paste", "report_pasted"), true);
  assert.equal(canTransition("report_pasted", "report_parsed"), true);
  assert.equal(canTransition("report_parsed", "findings_confirmed"), true);
});

test("submitting report content directly from the prompt-running stage is legal (prompt_displayed → report_pasted)", () => {
  // An explicit user submit of report content from the prompt-running stage
  // jumps into the paste pipeline. It reaches report_pasted (pasted, not yet
  // parsed) — never report_parsed or findings_confirmed directly.
  assert.equal(canTransition("prompt_displayed", "report_pasted"), true);
  assert.equal(canTransition("prompt_displayed", "report_parsed"), false);
  assert.equal(canTransition("prompt_displayed", "findings_confirmed"), false);
});

test("legal backward controls are allowed (re-paste / back)", () => {
  assert.equal(canTransition("user_ready_to_paste", "prompt_displayed"), true);
  assert.equal(canTransition("report_parsed", "user_ready_to_paste"), true);
  assert.equal(canTransition("report_pasted", "user_ready_to_paste"), true);
});

test("report_pasted → findings_confirmed is REJECTED — a failed/unparsed report can never be confirmed", () => {
  // findings_confirmed is reachable ONLY from report_parsed. There is no
  // report_pasted → findings_confirmed edge, so an unparseable paste (all fields
  // UNKNOWN, parse failure, still pending) can never "continue with what we have".
  assert.equal(canTransition("report_pasted", "findings_confirmed"), false);
  assert.equal(nextReadinessState("report_pasted", "findings_confirmed"), "report_pasted");
  // report_parsed is the only state from which findings_confirmed is reachable.
  assert.equal(canTransition("report_parsed", "findings_confirmed"), true);
});

test("start-over resets to intake from anywhere", () => {
  for (const state of READINESS_STATES) {
    if (state === "intake") continue;
    assert.equal(canTransition(state, "intake"), true, `${state} → intake`);
  }
});

test("re-entering the same state is idempotent (legal)", () => {
  for (const state of READINESS_STATES) {
    assert.equal(canTransition(state, state), true);
  }
});

// ---------------------------------------------------------------------------
// Rejected transitions — the model is authoritative and preserves state.
// ---------------------------------------------------------------------------

test("skipping a stage is rejected", () => {
  // intake cannot jump straight to paste/parse/confirm.
  assert.equal(canTransition("intake", "user_ready_to_paste"), false);
  assert.equal(canTransition("intake", "report_parsed"), false);
  assert.equal(canTransition("intake", "findings_confirmed"), false);
  // prompt_displayed cannot jump to report_parsed/findings_confirmed.
  assert.equal(canTransition("prompt_displayed", "report_parsed"), false);
  assert.equal(canTransition("prompt_displayed", "findings_confirmed"), false);
  // user_ready_to_paste cannot jump past report_pasted.
  assert.equal(canTransition("user_ready_to_paste", "report_parsed"), false);
  assert.equal(canTransition("user_ready_to_paste", "findings_confirmed"), false);
});

test("nextReadinessState preserves the current state on an illegal request", () => {
  assert.equal(nextReadinessState("intake", "findings_confirmed"), "intake");
  assert.equal(nextReadinessState("prompt_displayed", "report_parsed"), "prompt_displayed");
  // A legal request is applied.
  assert.equal(nextReadinessState("report_pasted", "report_parsed"), "report_parsed");
});

// ---------------------------------------------------------------------------
// Parse-outcome gate.
// ---------------------------------------------------------------------------

test("report_parsed is reached only on a successful parse with findings", () => {
  assert.equal(stateAfterParse({ parseStatus: "ok", findingsCount: 3 }), "report_parsed");
  assert.equal(stateAfterParse({ parseStatus: "partial", findingsCount: 2 }), "report_parsed");
  assert.equal(parseReachesReportParsed({ parseStatus: "ok", findingsCount: 1 }), true);
});

test("failed, pending, or empty parses stay at report_pasted (never report_parsed)", () => {
  assert.equal(stateAfterParse({ parseStatus: "manual", findingsCount: 0 }), "report_pasted");
  assert.equal(stateAfterParse({ parseStatus: "error", findingsCount: 5 }), "report_pasted");
  assert.equal(stateAfterParse({ parseStatus: "pending", findingsCount: 0 }), "report_pasted");
  assert.equal(stateAfterParse({ parseStatus: "ok", findingsCount: 0 }), "report_pasted");
  assert.equal(isParseFailureStatus("manual"), true);
  assert.equal(isParseFailureStatus("error"), true);
  assert.equal(isParseFailureStatus("ok"), false);
  assert.equal(isParseFailureStatus("partial"), false);
});

// ---------------------------------------------------------------------------
// Background mission-completion callback.
// ---------------------------------------------------------------------------

test("background completion may never enter report_parsed or findings_confirmed", () => {
  assert.equal(backgroundCompletionMayEnter("report_parsed"), false);
  assert.equal(backgroundCompletionMayEnter("findings_confirmed"), false);
  assert.deepEqual([...BACKGROUND_FORBIDDEN_STATES].sort(), [
    "findings_confirmed",
    "report_parsed",
  ]);
  // Earlier states are permissible targets for metadata-only progress.
  assert.equal(backgroundCompletionMayEnter("prompt_displayed"), true);
  assert.equal(backgroundCompletionMayEnter("user_ready_to_paste"), true);
  assert.equal(backgroundCompletionMayEnter("report_pasted"), true);
});

test("applyBackgroundCompletion never advances the state from any pre-confirm stage", () => {
  // From each stage the background completion path can fire at, the state is
  // preserved — it never lands on report_parsed or findings_confirmed.
  for (const state of ["prompt_displayed", "user_ready_to_paste", "report_pasted"] as const) {
    const after = applyBackgroundCompletion(state);
    assert.equal(after, state);
    assert.equal(BACKGROUND_FORBIDDEN_STATES.has(after), false);
  }
});

// ---------------------------------------------------------------------------
// Asynchronous mission-callback guard (run-identity + progression).
// ---------------------------------------------------------------------------

test("missionCallbackMatchesRun accepts only an exact non-empty run-id match", () => {
  assert.equal(missionCallbackMatchesRun("run_a", "run_a"), true);
  assert.equal(missionCallbackMatchesRun(" run_a ", "run_a"), true);
  // A different run id — a late callback from an earlier run — never matches.
  assert.equal(missionCallbackMatchesRun("run_prior", "run_new"), false);
  // Fails closed on unattributable callbacks (missing / empty ids).
  assert.equal(missionCallbackMatchesRun(null, "run_new"), false);
  assert.equal(missionCallbackMatchesRun("run_prior", null), false);
  assert.equal(missionCallbackMatchesRun("", ""), false);
  assert.equal(missionCallbackMatchesRun(undefined, undefined), false);
});

test("a completion callback from a PRIOR run does not advance a newer active run", () => {
  // A new run is active (run_new). A completion callback produced by the earlier
  // run (run_prior) arrives late — it must be ignored: not accepted, no paste
  // write, no findings, and the readiness state is preserved (no advancement
  // into report_pasted / report_parsed / Confirm-findings).
  for (const currentState of READINESS_STATES) {
    const decision = guardMissionCallback({
      callbackRunId: "run_prior",
      activeRunId: "run_new",
      currentState,
    });
    assert.equal(decision.matchesActiveRun, false);
    assert.equal(decision.accepted, false);
    assert.equal(decision.nextState, currentState, `${currentState} must be preserved`);
    assert.equal(decision.writesPasteText, false);
    assert.equal(decision.createsFindings, false);
  }
});

test('an "Analysis completed." callback never populates paste, creates findings, or advances', () => {
  // Even for the ACTIVE run, a background mission-completion callback (body only
  // "Analysis completed.") records nothing into the pasted-report field, creates
  // no structured findings, and does not advance readiness progress or reach
  // Confirm findings — the paste stage is never completed on the user's behalf.
  for (const currentState of [
    "prompt_displayed",
    "user_ready_to_paste",
    "report_pasted",
  ] as const) {
    const decision = guardMissionCallback({
      callbackRunId: "run_active",
      activeRunId: "run_active",
      currentState,
    });
    // The run matches, so the notice may surface — but no progression happens.
    assert.equal(decision.matchesActiveRun, true);
    assert.equal(decision.accepted, true);
    assert.equal(decision.nextState, currentState);
    assert.equal(decision.writesPasteText, false);
    assert.equal(decision.createsFindings, false);
    // The resolved next state is never a forbidden background target.
    assert.equal(BACKGROUND_FORBIDDEN_STATES.has(decision.nextState), false);
  }
});

// ---------------------------------------------------------------------------
// Hydration / resume.
// ---------------------------------------------------------------------------

test("hydration maps persisted stages to the matching legal state", () => {
  assert.equal(hydrateReadinessState({ stage: "intake" }), "intake");
  assert.equal(hydrateReadinessState({ stage: "project" }), "intake");
  assert.equal(hydrateReadinessState({ stage: "prompt" }), "prompt_displayed");
  assert.equal(hydrateReadinessState({ stage: "stage2" }), "prompt_displayed");
  assert.equal(hydrateReadinessState({ stage: "paste" }), "user_ready_to_paste");
  assert.equal(hydrateReadinessState({ stage: "stage3" }), "user_ready_to_paste");
  assert.equal(hydrateReadinessState({ stage: "gate" }), "findings_confirmed");
  assert.equal(hydrateReadinessState({ stage: "scored" }), "findings_confirmed");
});

test("hydration of a confirm-stage draft respects the parse outcome (persistence path)", () => {
  // A confirm draft with a genuine successful parse hydrates to report_parsed.
  assert.equal(
    hydrateReadinessState({ stage: "confirm", parseStatus: "ok", findingsCount: 4 }),
    "report_parsed",
  );
  // A confirm draft whose parse failed hydrates to report_pasted, never forward.
  assert.equal(
    hydrateReadinessState({ stage: "confirm", parseStatus: "manual", findingsCount: 0 }),
    "report_pasted",
  );
  assert.equal(
    hydrateReadinessState({ stage: "confirm", parseStatus: "pending", findingsCount: 0 }),
    "report_pasted",
  );
});

test("an explicitly confirmed flow persists a stage that hydrates back to findings_confirmed", () => {
  // Regression: the confirmed results gate must survive a plain reload. The
  // stage persisted for findings_confirmed must NOT hydrate back to a report_*
  // state (which would drop the user from the results gate to the confirm step).
  const stage = persistedStageForState("findings_confirmed");
  assert.equal(stage, "gate");
  assert.equal(hydrateReadinessState({ stage }), "findings_confirmed");
  // Even with a persisted parse payload present on the draft, the confirmed
  // stage hydrates to findings_confirmed — never regressing to report_parsed.
  assert.equal(
    hydrateReadinessState({ stage, parseStatus: "ok", findingsCount: 6 }),
    "findings_confirmed",
  );
});

test("persistedStageForState round-trips every state through hydration", () => {
  // report_parsed is the one non-injective case: it persists as the "confirm"
  // stage and is reconstructed from a successful parse payload, so its round
  // trip must carry that payload. Every other state round-trips on stage alone.
  for (const state of READINESS_STATES) {
    const stage = persistedStageForState(state);
    const hydrated =
      state === "report_parsed"
        ? hydrateReadinessState({ stage, parseStatus: "ok", findingsCount: 4 })
        : hydrateReadinessState({ stage });
    assert.equal(hydrated, state, `${state} → ${stage} → ${hydrated}`);
  }
});

test("hydration falls back to intake for unknown/missing stages", () => {
  assert.equal(hydrateReadinessState({}), "intake");
  assert.equal(hydrateReadinessState({ stage: null }), "intake");
  assert.equal(hydrateReadinessState({ stage: "who-knows" }), "intake");
});

// ---------------------------------------------------------------------------
// URL entry point (?new=1 isolation vs. resume).
// ---------------------------------------------------------------------------

test("?new=1 always starts at intake, ignoring a prior resumable session", () => {
  const resumed = { stage: "confirm", parseStatus: "ok", findingsCount: 5 };
  assert.equal(entryReadinessState({ newAnalysisRequested: true, resumed }), "intake");
});

test("without ?new=1 a resumable session hydrates to its legal stage", () => {
  assert.equal(
    entryReadinessState({
      newAnalysisRequested: false,
      resumed: { stage: "paste" },
    }),
    "user_ready_to_paste",
  );
  assert.equal(
    entryReadinessState({
      newAnalysisRequested: false,
      resumed: { stage: "confirm", parseStatus: "ok", findingsCount: 3 },
    }),
    "report_parsed",
  );
  // No resumable session → intake.
  assert.equal(entryReadinessState({ newAnalysisRequested: false, resumed: null }), "intake");
});

// ---------------------------------------------------------------------------
// New-analysis (?new=1) run initialisation — clear all prior run data.
// ---------------------------------------------------------------------------

test("?new=1 never restores a persisted run; a plain visit does", () => {
  assert.equal(shouldRestorePersistedReadinessRun(true), false);
  assert.equal(shouldRestorePersistedReadinessRun(false), true);
});

test("freshReadinessRun starts at intake with a fresh id and every prior-run field cleared", () => {
  const fresh = freshReadinessRun("run_abc123");
  assert.equal(fresh.runId, "run_abc123");
  assert.equal(fresh.stage, "intake");
  // Every prior-run field the mission enumerates is explicitly cleared, so
  // spreading this over a completed / Step-8 draft wipes it (not merges):
  // the analysis prompt response, pasted input, parse error, parse result,
  // findings, progress, and completion flags.
  assert.equal(fresh.promptResponse, undefined);
  assert.equal(fresh.pasteText, undefined);
  assert.equal(fresh.parseError, undefined);
  assert.equal(fresh.parseStatus, undefined);
  assert.equal(fresh.report, undefined);
  assert.equal(fresh.findings, undefined);
  assert.equal(fresh.progress, undefined);
  assert.equal(fresh.confirmedAt, undefined);
  assert.equal(fresh.submissionId, undefined);
  assert.equal(fresh.completed, undefined);
});

test("spreading freshReadinessRun over a completed/Step-8 draft clears every prior field", () => {
  // A completed (Step 9) draft with everything set.
  const priorCompleted = {
    runId: "run_prior",
    token: "prior-token",
    stage: "gate",
    pasteText: "VYGO-READINESS-REPORT: ...",
    promptResponse: "the AI response",
    parseError: "boom",
    parseStatus: "ok",
    report: { stack: "Next.js" },
    findings: ["Auth hardening", "Rate limiting"],
    progress: 100,
    confirmedAt: "2026-01-01T00:00:00.000Z",
    submissionId: "sub-123",
    completed: true,
  };
  const merged = { ...priorCompleted, ...freshReadinessRun("run_new") };
  assert.equal(merged.runId, "run_new");
  assert.equal(merged.stage, "intake");
  for (const field of [
    "pasteText",
    "promptResponse",
    "parseError",
    "parseStatus",
    "report",
    "findings",
    "progress",
    "confirmedAt",
    "submissionId",
    "completed",
  ] as const) {
    assert.equal(merged[field], undefined, `${field} must be cleared`);
  }
});

test("two consecutive fresh runs get distinct ids and both start clean at intake", () => {
  const first = freshReadinessRun("run_first");
  const second = freshReadinessRun("run_second");
  assert.notEqual(first.runId, second.runId);
  assert.equal(first.stage, "intake");
  assert.equal(second.stage, "intake");
  assert.equal(second.findings, undefined);
  assert.equal(second.pasteText, undefined);
});

// A fresh flow never skips a stage: every legal single step from intake to
// findings_confirmed exists as a transition edge.
test("a full legal walk intake → findings_confirmed skips nothing", () => {
  const walk: ReadinessState[] = [
    "intake",
    "prompt_displayed",
    "user_ready_to_paste",
    "report_pasted",
    "report_parsed",
    "findings_confirmed",
  ];
  for (let i = 0; i < walk.length - 1; i += 1) {
    const from = walk[i];
    const to = walk[i + 1];
    if (!from || !to) throw new Error("walk index out of range");
    assert.equal(canTransition(from, to), true, `${from} → ${to}`);
  }
});
