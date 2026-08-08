/**
 * Authoritative readiness progression state machine.
 *
 * One transition model for how a readiness analysis advances through its
 * user-facing stages. This replaces the previous scatter of completion-derived
 * booleans (empty-findings heuristics, "did the parse land yet" guesses, view
 * strings inferred from multiple flags) with a single explicit set of states
 * and the legal transitions between them. Every readiness-stage gate — the web
 * flow, resume/hydration, and the background mission-completion callback — reads
 * its decisions from here so no code path can invent out-of-order progress.
 *
 * The ordered progression is:
 *   intake → prompt_displayed → user_ready_to_paste → report_pasted
 *          → report_parsed → findings_confirmed
 *
 * Hard rules encoded below:
 *  - report_parsed is reached ONLY on a genuine successful parse (a non-failure,
 *    non-pending status that produced findings). A failed, pending, or empty
 *    parse stays at report_pasted.
 *  - findings_confirmed is reached ONLY by explicit user confirmation.
 *  - a background mission-completion callback may record results as metadata but
 *    must NEVER move the state into report_parsed or findings_confirmed.
 */

export const READINESS_STATES = [
  /** Project pick + Stage 1 intake questions (everything before the prompt). */
  "intake",
  /** The tailored diagnostic prompt is displayed. */
  "prompt_displayed",
  /** The paste-results step is open, awaiting the user's report. */
  "user_ready_to_paste",
  /** A report has been submitted; a successful parse is not yet confirmed. */
  "report_pasted",
  /** The report parsed successfully into structured findings. */
  "report_parsed",
  /** The user explicitly confirmed the findings (proceeds to the scored gate). */
  "findings_confirmed",
] as const;

export type ReadinessState = (typeof READINESS_STATES)[number];

/**
 * Legal forward and backward transitions. Backward edges model the controls the
 * flow actually exposes (a "Back" from the paste step, a "Re-paste" from the
 * confirm view). Every state may drop back to `intake` because "New analysis" /
 * "Start over" resets the flow from anywhere.
 */
const LEGAL_TRANSITIONS: Record<ReadinessState, readonly ReadinessState[]> = {
  intake: ["prompt_displayed"],
  // From the prompt-running stage the primary forward edge is the explicit
  // "proceed to paste" action (user_ready_to_paste). Submitting report content
  // directly from the prompt-running stage is ALSO an explicit user action and
  // jumps straight into the paste pipeline (report_pasted) — the report has been
  // pasted but not yet parsed. This edge is reachable only by a user-initiated
  // submit, never by a background mission-completion callback (those are barred
  // by guardMissionCallback), so it cannot let polling race the flow forward.
  // There is deliberately still NO prompt_displayed → report_parsed /
  // findings_confirmed edge: those require a successful parse and explicit
  // confirmation respectively.
  prompt_displayed: ["user_ready_to_paste", "report_pasted", "intake"],
  user_ready_to_paste: ["report_pasted", "prompt_displayed", "intake"],
  // From report_pasted the ONLY forward edge is report_parsed, and that edge is
  // taken only on a genuine successful parse (see parseReachesReportParsed). A
  // failed, pending, or empty parse has no forward edge from here — the user can
  // only re-paste (back to user_ready_to_paste) or start over. There is NO
  // report_pasted → findings_confirmed edge: findings_confirmed requires a
  // successful parse (report_parsed) first, then an explicit user confirmation.
  // This is what forbids "continue with what we have" on an unparseable paste.
  report_pasted: ["report_parsed", "user_ready_to_paste", "intake"],
  report_parsed: ["findings_confirmed", "user_ready_to_paste", "intake"],
  findings_confirmed: ["intake"],
};

export function isReadinessState(value: unknown): value is ReadinessState {
  return typeof value === "string" && (READINESS_STATES as readonly string[]).includes(value);
}

/**
 * True when moving from `from` to `to` is a legal transition. Re-entering the
 * same state (a re-render / idempotent set) is always allowed.
 */
export function canTransition(from: ReadinessState, to: ReadinessState): boolean {
  if (from === to) return true;
  return (LEGAL_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Apply a requested transition under the model. A legal request returns the new
 * state; an illegal request is REJECTED — the current state is preserved so no
 * caller can force an out-of-order jump. The model is authoritative.
 */
export function nextReadinessState(from: ReadinessState, to: ReadinessState): ReadinessState {
  return canTransition(from, to) ? to : from;
}

/** Ordinal position of a state in the canonical progression (for comparisons). */
export function readinessStateOrder(state: ReadinessState): number {
  return READINESS_STATES.indexOf(state);
}

// ---------------------------------------------------------------------------
// Parse-outcome gate — the single decision of whether a parse reaches
// report_parsed. Nothing else in the flow is allowed to infer this.
// ---------------------------------------------------------------------------

/**
 * parseStatus values that mean the paste genuinely could not be read as a
 * structured report — a real parse failure, distinct from a benign in-progress
 * "pending"/"partial".
 */
export const PARSE_FAILURE_STATUSES = ["manual", "error"] as const;

export function isParseFailureStatus(status: unknown): boolean {
  return (
    typeof status === "string" && (PARSE_FAILURE_STATUSES as readonly string[]).includes(status)
  );
}

export function isParsePendingStatus(status: unknown): boolean {
  return status === "pending";
}

export type ParseOutcome = {
  parseStatus: unknown;
  findingsCount: number;
};

/**
 * The authoritative test for "did this parse succeed well enough to reach
 * report_parsed". True only for a non-failure, non-pending status that produced
 * at least one finding. Everything else (failure, pending, or zero findings)
 * stays at report_pasted.
 */
export function parseReachesReportParsed(outcome: ParseOutcome): boolean {
  if (isParseFailureStatus(outcome.parseStatus)) return false;
  if (isParsePendingStatus(outcome.parseStatus)) return false;
  return outcome.findingsCount > 0;
}

/** Next state after a paste's parse result resolves. */
export function stateAfterParse(outcome: ParseOutcome): ReadinessState {
  return parseReachesReportParsed(outcome) ? "report_parsed" : "report_pasted";
}

// ---------------------------------------------------------------------------
// Background mission-completion guard.
// ---------------------------------------------------------------------------

/**
 * States a background mission-completion callback must never enter on its own —
 * they require successful parsing and explicit user confirmation respectively.
 */
export const BACKGROUND_FORBIDDEN_STATES: ReadonlySet<ReadinessState> = new Set([
  "report_parsed",
  "findings_confirmed",
]);

/** True when a background callback is permitted to move the flow into `target`. */
export function backgroundCompletionMayEnter(target: ReadinessState): boolean {
  return !BACKGROUND_FORBIDDEN_STATES.has(target);
}

/**
 * Resolve the state after a background mission-completion callback fires. The
 * callback may record results as metadata, but it must not advance the readiness
 * state — least of all into report_parsed or findings_confirmed. The current
 * state is therefore always preserved.
 */
export function applyBackgroundCompletion(current: ReadinessState): ReadinessState {
  return current;
}

/**
 * True when an asynchronous readiness mission update belongs to the run that is
 * currently active in the flow. A readiness analysis is asynchronous: the
 * customer's AI POSTs results back (or a mission completion fires) some time
 * after the run began, by which point the user may have started a NEWER run.
 * Every such callback is stamped with the run id it was produced for, and this
 * gate compares it to the flow's active run id.
 *
 * Fails closed: a callback with no run id, or one that arrives while no run is
 * active, does NOT match — an unattributable late callback must never be allowed
 * to touch a run it cannot be proven to belong to. Only a non-empty run id that
 * exactly equals the active run id matches.
 */
export function missionCallbackMatchesRun(
  callbackRunId: string | null | undefined,
  activeRunId: string | null | undefined,
): boolean {
  const cb = typeof callbackRunId === "string" ? callbackRunId.trim() : "";
  const active = typeof activeRunId === "string" ? activeRunId.trim() : "";
  if (!cb || !active) return false;
  return cb === active;
}

/** What an asynchronous mission callback is permitted to do once guarded. */
export type MissionCallbackDecision = {
  /** True only when the callback's run id matches the active run (see below). */
  matchesActiveRun: boolean;
  /**
   * True when the callback may record its results as background metadata (a
   * "results are ready" notice). Equal to matchesActiveRun — a callback from an
   * earlier run is dropped entirely.
   */
  accepted: boolean;
  /**
   * The readiness state after the callback. ALWAYS the current state: a
   * background callback never advances readiness progress, never completes the
   * paste stage, and never reaches Confirm findings.
   */
  nextState: ReadinessState;
  /**
   * Whether the callback may write its body into the pasted-report field.
   * ALWAYS false: mission status / completion text must never populate the
   * paste box — only a user's own paste does.
   */
  writesPasteText: boolean;
  /**
   * Whether the callback may create structured findings. ALWAYS false: findings
   * come only from a user-driven parse of a genuinely pasted report.
   */
  createsFindings: boolean;
};

/**
 * Guard an asynchronous readiness mission callback against two independent rules,
 * both of which must hold before ANY effect is applied to the flow:
 *
 *  1. Run-identity guard (missionCallbackMatchesRun): a late callback from an
 *     EARLIER run is IGNORED — it cannot touch the newer run's state, paste
 *     field, or findings. This stops a completion that finished after the user
 *     started a fresh analysis (e.g. via /readiness?new=1) from leaking into the
 *     new run.
 *
 *  2. Progression guard: even a callback that DOES belong to the active run is a
 *     background event. It may surface that results arrived, but it must never
 *     advance the readiness state, never populate the pasted-report field, and
 *     never fabricate structured findings — those require a user-driven parse and
 *     an explicit confirmation. So nextState is ALWAYS the current state and both
 *     writesPasteText and createsFindings are ALWAYS false.
 *
 * In particular a callback whose body is only "Analysis completed." changes
 * nothing: it does not advance progress, complete the paste stage, create
 * findings, or reach Confirm findings.
 */
export function guardMissionCallback(input: {
  callbackRunId: string | null | undefined;
  activeRunId: string | null | undefined;
  currentState: ReadinessState;
}): MissionCallbackDecision {
  const matchesActiveRun = missionCallbackMatchesRun(input.callbackRunId, input.activeRunId);
  return {
    matchesActiveRun,
    accepted: matchesActiveRun,
    nextState: input.currentState,
    writesPasteText: false,
    createsFindings: false,
  };
}

// ---------------------------------------------------------------------------
// Received-report ingest signal — the single decision for what the Stage 2
// waiting screen does when the customer's AI POSTs its report back, and whether
// the manual copy-paste prompt is shown. These are the authoritative rules
// behind the "received but stuck on the paste prompt" fix: nothing in the flow
// is allowed to re-derive them inline. The web ReadinessFlow reads BOTH the poll
// branch and the waiting-screen paste visibility from here, so a report that has
// been received (and persisted) can never leave the flow stranded on the paste
// prompt.
// ---------------------------------------------------------------------------

/**
 * What an observed ingest status ("readiness report received") signal should do
 * to the waiting flow:
 *  - "keep_waiting": nothing actionable landed yet (an accepted-but-empty
 *    receipt with no results bytes) — keep polling, do NOT leave the waiting
 *    screen.
 *  - "auto_confirm": a durably PERSISTED/validated report landed — auto-advance
 *    straight to the Confirm-findings step by running the same parse+confirm the
 *    manual paste runs, with NO manual paste required.
 *  - "open_paste_step": results landed but were not reported as persisted (older
 *    rollout / a status-string-only fixture) — leave the waiting screen and open
 *    the paste step so the user pastes their own report; do not fabricate a
 *    confirmed parse from an unpersisted receipt.
 */
export type ReceivedSignalOutcome = "keep_waiting" | "auto_confirm" | "open_paste_step";

/**
 * Decide what a landed ingest "received" signal does to the waiting flow. This
 * is the fix for the stuck-on-paste bug: a signal that carries actual results
 * NEVER stays on the waiting/paste prompt — a persisted report auto-advances to
 * confirm with no manual paste, and even an unpersisted receipt at least opens
 * the paste step automatically. Only a genuinely empty receipt keeps waiting.
 */
export function receivedSignalOutcome(input: {
  /** True when the poll carried actual report bytes (results_text/results). */
  hasResults: boolean;
  /** The endpoint's machine-readable "received AND persisted" confirmation. */
  persisted: boolean;
}): ReceivedSignalOutcome {
  if (!input.hasResults) return "keep_waiting";
  return input.persisted ? "auto_confirm" : "open_paste_step";
}

/**
 * Whether the manual copy-paste prompt should be revealed on the Stage 2 waiting
 * screen. The prompt stays HIDDEN while auto-detection is genuinely waiting; it
 * is revealed only as a fallback — when there is no submission token to poll (so
 * auto-detection cannot run and pasting is the only way forward) or the bounded
 * fallback timeout elapsed / detection reported a failure (`fallbackRevealed`).
 *
 * The load-bearing rule for the bug: a confirmed receipt (`resultsReceived`)
 * ALWAYS hides the prompt. Once a readiness report has been received, the paste
 * prompt must not persist or reappear — the flow has already left the waiting
 * screen (auto-advancing to confirm or the paste step), so re-showing the prompt
 * here would strand the user on it.
 */
export function shouldRevealManualPastePrompt(input: {
  /** True when a live submission token is being polled for auto-detection. */
  hasSubmissionToken: boolean;
  /** True once the bounded fallback timeout elapsed or detection failed. */
  fallbackRevealed: boolean;
  /** True once a readiness report has been received for this run. */
  resultsReceived: boolean;
}): boolean {
  if (input.resultsReceived) return false;
  return !input.hasSubmissionToken || input.fallbackRevealed;
}

// ---------------------------------------------------------------------------
// Hydration / resume — rebuild the state from persisted data.
// ---------------------------------------------------------------------------

export type HydrationInput = {
  /** Persisted session stage string (server row or local draft). */
  stage?: string | null;
  /** Persisted parse status, if the paste was already parsed. */
  parseStatus?: unknown;
  /** Number of parsed findings persisted with the draft. */
  findingsCount?: number;
};

/**
 * Map a persisted session (server stage string + draft parse status) to the
 * readiness state a resume/hydration should land on. Used for reload, multi-tab,
 * and server-hydrated resume so every entry point rebuilds the SAME legal state
 * from the same persisted data. It never fabricates forward progress: a
 * "confirm"-stage draft whose parse did not succeed hydrates to report_pasted,
 * not report_parsed.
 */
export function hydrateReadinessState(input: HydrationInput): ReadinessState {
  const stage = (input.stage ?? "").trim().toLowerCase();
  switch (stage) {
    case "prompt":
    case "stage2":
      return "prompt_displayed";
    case "paste":
    case "stage3":
      return "user_ready_to_paste";
    case "confirm":
      return stateAfterParse({
        parseStatus: input.parseStatus,
        findingsCount: input.findingsCount ?? 0,
      });
    case "gate":
    case "scored":
      return "findings_confirmed";
    case "intake":
    case "project":
    case "":
    default:
      return "intake";
  }
}

/**
 * Canonical persisted-stage string for each readiness state. This is the inverse
 * of hydrateReadinessState: the value written to the session row / local draft
 * when the flow reaches a state, chosen so a later hydrateReadinessState() of
 * that stage rebuilds the SAME state. Persisting through this map (rather than
 * hand-picking a stage string at each call site) is what keeps the confirmed
 * results gate durable: findings_confirmed persists as "gate", and "gate"
 * hydrates back to findings_confirmed — so a plain reload or a second browser
 * context restores the gate instead of dropping back to the confirm step.
 *
 * report_parsed has no distinct persisted stage of its own: it is a "confirm"
 * stage whose parse succeeded, and hydrateReadinessState reconstructs it from the
 * persisted parseStatus + findingsCount. It therefore shares the "confirm" stage
 * with report_pasted; only the explicit-confirmation step advances to "gate".
 */
const PERSISTED_STAGE_FOR_STATE: Record<ReadinessState, string> = {
  intake: "intake",
  prompt_displayed: "prompt",
  user_ready_to_paste: "paste",
  report_pasted: "confirm",
  report_parsed: "confirm",
  findings_confirmed: "gate",
};

/**
 * The stage string to persist for a readiness state so a subsequent hydration
 * rebuilds the same state. Use this at every gate that writes progress, so the
 * transition model — not an ad-hoc string literal — decides what "confirmed"
 * looks like on disk.
 */
export function persistedStageForState(state: ReadinessState): string {
  return PERSISTED_STAGE_FOR_STATE[state];
}

/**
 * Entry-point resolution combining URL intent with any resumable session. A
 * fresh-flow request (?new=1 / "New analysis") ALWAYS starts at intake and must
 * never hydrate a prior resumable session into a later stage. Otherwise the
 * persisted session is hydrated.
 */
export function entryReadinessState(input: {
  newAnalysisRequested: boolean;
  resumed: HydrationInput | null;
}): ReadinessState {
  if (input.newAnalysisRequested) return "intake";
  if (!input.resumed) return "intake";
  return hydrateReadinessState(input.resumed);
}

// ---------------------------------------------------------------------------
// New-analysis (?new=1) run initialisation — clear ALL prior run data before
// any hydration can restore it.
// ---------------------------------------------------------------------------

/**
 * Whether a persisted readiness run may be restored on this page load. A
 * new-analysis request (?new=1 / "New analysis") must NEVER restore prior run
 * data — not the prompt response, pasted input, parse error/result, findings,
 * progress, stage, or any completion flag — so it always returns false. A plain
 * visit restores. This is the single authoritative rule the flow reads so
 * "wipe everything on ?new=1, resume otherwise" cannot drift between call sites.
 */
export function shouldRestorePersistedReadinessRun(newAnalysisRequested: boolean): boolean {
  return !newAnalysisRequested;
}

/**
 * The shape of a freshly-initialised readiness run: a brand-new run identifier
 * and the intake stage, with every prior-run field cleared. The optional
 * cleared fields are listed explicitly (rather than merely omitted) so a caller
 * that spreads this over a prior persisted state overwrites — not merges — each
 * one, and so the "what a new run wipes" contract has one source of truth: the
 * analysis prompt response, pasted input, parse error, parse status/result,
 * findings, progress percentage, and completion flags.
 */
export type FreshReadinessRun = {
  runId: string;
  stage: ReadinessState;
  promptResponse: undefined;
  pasteText: undefined;
  parseError: undefined;
  parseStatus: undefined;
  report: undefined;
  findings: undefined;
  progress: undefined;
  confirmedAt: undefined;
  submissionId: undefined;
  completed: undefined;
};

/**
 * Build the cleared state for a brand-new analysis run stamped with `runId`.
 * Every prior-run field is set to `undefined` so spreading this over a completed
 * or Step-8 persisted state wipes it: the new run starts at intake with no
 * restored prompt response, pasted input, parse error, parse result, finding,
 * progress, or completion flag. Pure and synchronous — it never touches storage
 * or the network, so it can run before any hydration/resume reads persisted
 * state.
 */
export function freshReadinessRun(runId: string): FreshReadinessRun {
  return {
    runId,
    stage: "intake",
    promptResponse: undefined,
    pasteText: undefined,
    parseError: undefined,
    parseStatus: undefined,
    report: undefined,
    findings: undefined,
    progress: undefined,
    confirmedAt: undefined,
    submissionId: undefined,
    completed: undefined,
  };
}
