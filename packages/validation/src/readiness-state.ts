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
  prompt_displayed: ["user_ready_to_paste", "intake"],
  user_ready_to_paste: ["report_pasted", "prompt_displayed", "intake"],
  // From report_pasted a successful parse advances to report_parsed; the user
  // may re-paste (back to user_ready_to_paste); and an explicit "continue with
  // what we have" on a failed parse is a user-driven confirm (findings_confirmed).
  report_pasted: ["report_parsed", "user_ready_to_paste", "findings_confirmed", "intake"],
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
