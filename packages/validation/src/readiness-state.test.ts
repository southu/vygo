import assert from "node:assert/strict";
import { test } from "node:test";
import {
  READINESS_STATES,
  BACKGROUND_FORBIDDEN_STATES,
  applyBackgroundCompletion,
  backgroundCompletionMayEnter,
  canTransition,
  entryReadinessState,
  hydrateReadinessState,
  isParseFailureStatus,
  isReadinessState,
  nextReadinessState,
  parseReachesReportParsed,
  readinessStateOrder,
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

test("legal backward controls are allowed (re-paste / back)", () => {
  assert.equal(canTransition("user_ready_to_paste", "prompt_displayed"), true);
  assert.equal(canTransition("report_parsed", "user_ready_to_paste"), true);
  assert.equal(canTransition("report_pasted", "user_ready_to_paste"), true);
});

test("an explicit continue on a failed parse (report_pasted → findings_confirmed) is legal", () => {
  assert.equal(canTransition("report_pasted", "findings_confirmed"), true);
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
