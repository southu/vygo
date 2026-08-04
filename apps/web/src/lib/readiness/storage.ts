/** localStorage helpers for the readiness flow (multi-tab + next-day resume). */

import { EMPTY_STAGE1, freshReadinessRun } from "@vygo/validation";
import type { ManualAnswers, ReadinessStage1Answers } from "@vygo/validation";

export const READINESS_STORAGE_KEY = "vygo:readiness:v1" as const;
/**
 * Separate key holding a snapshot of the most recent VALID in-progress run that
 * reached Step 8 (Confirm findings — the `confirm`/report_parsed state) so it can
 * be resumed even after the main key has been overwritten by a `/readiness?new=1`
 * clean start.
 *
 * The single main key is deliberately OVERWRITTEN by `?new=1` (see
 * initNewReadinessRun) to isolate a fresh run from any prior draft. That
 * overwrite would also destroy the saved resume token/structured draft of a
 * valid Step-8 session, so a following plain `/readiness` would drop back to a
 * clean Step 1 instead of resuming Step 8. Persisting the valid session under
 * this SEPARATE key — which `?new=1` never touches — keeps the resumable session
 * intact alongside the clean-start session.
 */
export const READINESS_RESUME_KEY = "vygo:readiness:resume:v1" as const;
/** Separate key for the browser's remembered project labels (choose-existing list). */
export const READINESS_PROJECTS_KEY = "vygo:readiness:projects:v1" as const;
/** Cap on remembered project labels so the picker stays small. */
const MAX_KNOWN_PROJECTS = 12;

export type ReadinessLocalState = {
  token: string | null;
  stage: string;
  stage1: Partial<ReadinessStage1Answers>;
  email?: string;
  offRampKind?: "not_built_yet" | "features_only" | null;
  /** Stage 3 paste draft. */
  pasteText?: string;
  /** Manual questionnaire answers. */
  manualAnswers?: ManualAnswers;
  source?: string;
  confidence?: string;
  /** Project label this analysis run is filed under. */
  projectLabel?: string;
  /**
   * Client-generated identifier for this analysis run. Minted synchronously at
   * the start of a run (a ?new=1 visit mints a fresh one) so the current run can
   * be distinguished from any prior run's persisted state without waiting on the
   * server round-trip that assigns the session token.
   */
  runId?: string | null;
  updatedAt: string;
};

export function loadReadinessLocal(): ReadinessLocalState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(READINESS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReadinessLocalState;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveReadinessLocal(state: ReadinessLocalState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      READINESS_STORAGE_KEY,
      JSON.stringify({ ...state, updatedAt: new Date().toISOString() }),
    );
  } catch {
    // Quota / private mode — server session still durable.
  }
}

export function clearReadinessLocal(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(READINESS_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * The signed-in user's identity as already captured by the app: the email the
 * visitor supplied during the readiness flow, persisted in the main readiness
 * state (and mirrored in the Step-8 resume snapshot). Returns a trimmed,
 * lower-cased address, or null when no identity has been established yet. This
 * is the same identity the readiness/analysis views key their history by, so
 * downstream views can name the real signed-in user rather than any fixture.
 */
export function loadSignedInEmail(): string | null {
  if (typeof window === "undefined") return null;
  const fromMain = loadReadinessLocal()?.email;
  const fromResume = loadReadinessResume()?.email;
  const raw = (fromMain || fromResume || "").trim().toLowerCase();
  return raw ? raw : null;
}

/**
 * Stages that represent a VALID Step-8 in-progress session worth preserving for
 * resume: the report has been pasted and parsed into structured findings
 * (`confirm`). This is exactly the state a plain `/readiness` must restore after
 * a `?new=1` clean start overwrote the main key. `gate` (Step 9, findings
 * already confirmed) is intentionally excluded so a resume lands back on Step 8
 * — Confirm findings — with its structured findings, not the score gate.
 */
export function isPreservableReadinessState(
  state: ReadinessLocalState | null | undefined,
): state is ReadinessLocalState {
  return Boolean(
    state && typeof state.token === "string" && state.token && state.stage === "confirm",
  );
}

/**
 * Whether the given state is an ADVANCED, resumable in-progress run — one a plain
 * `/readiness` load would already resume from the main key (prompt/paste/confirm
 * and beyond). Used to decide whether the preserved resume snapshot should take
 * over: only when the main key holds NO such advanced run (e.g. a `?new=1` clean
 * intake) does the preserved Step-8 snapshot get restored instead, so a genuine
 * in-progress run in the main key is never clobbered by an older snapshot.
 */
export function isResumableInProgress(
  state: ReadinessLocalState | null | undefined,
): state is ReadinessLocalState {
  if (!state || typeof state.token !== "string" || !state.token) return false;
  return (
    state.stage === "prompt" ||
    state.stage === "stage2" ||
    state.stage === "paste" ||
    state.stage === "stage3" ||
    state.stage === "confirm" ||
    state.stage === "gate" ||
    state.stage === "scored"
  );
}

/**
 * Load the preserved valid Step-8 resume snapshot (see READINESS_RESUME_KEY),
 * or null when none is stored or it is not a preservable Step-8 session.
 */
export function loadReadinessResume(): ReadinessLocalState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(READINESS_RESUME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReadinessLocalState;
    if (!isPreservableReadinessState(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Persist the valid Step-8 session as the resume snapshot under the SEPARATE
 * resume key. Only preservable Step-8 sessions are written; anything else is
 * ignored so a partial/intake state can never masquerade as a resumable run.
 * A `?new=1` clean start never calls this and never clears this key, so the
 * resumable session survives alongside the clean-start session.
 */
export function saveReadinessResume(state: ReadinessLocalState): void {
  if (typeof window === "undefined") return;
  if (!isPreservableReadinessState(state)) return;
  try {
    window.localStorage.setItem(
      READINESS_RESUME_KEY,
      JSON.stringify({ ...state, updatedAt: new Date().toISOString() }),
    );
  } catch {
    // Quota / private mode — server session still durable.
  }
}

export function clearReadinessResume(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(READINESS_RESUME_KEY);
  } catch {
    // ignore
  }
}

/**
 * Generate a fresh, unique analysis/run identifier. Uses crypto.randomUUID when
 * available (all supported browsers) and falls back to a timestamp+random string
 * so a run id is always produced synchronously — no network, no async.
 */
export function generateReadinessRunId(): string {
  try {
    const c = (globalThis as { crypto?: Crypto }).crypto;
    if (c && typeof c.randomUUID === "function") return `run_${c.randomUUID()}`;
  } catch {
    // fall through to the manual fallback
  }
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Synchronously initialise a brand-new analysis run for /readiness?new=1.
 *
 * OVERWRITES (not just removes) the persisted readiness state with a clean
 * intake state stamped with a FRESH run identifier, before any hydration/resume
 * logic can read the old value. Overwriting — rather than clearing then writing
 * asynchronously after a server round-trip — guarantees there is no window in
 * which a prior completed or Step-8 run's prompt response, pasted input, parse
 * error, parse result, findings, progress, stage, or completion flag remains
 * readable, and that the new run id is durably stored even if the later session
 * creation fails. Returns the new run id so the caller can hold it in state.
 */
export function initNewReadinessRun(): string {
  const runId = generateReadinessRunId();
  saveReadinessLocal({
    token: null,
    stage1: { ...EMPTY_STAGE1 },
    // freshReadinessRun provides `stage: "intake"` and every prior-run field
    // cleared (see @vygo/validation), stamped with the fresh run id.
    ...freshReadinessRun(runId),
    updatedAt: new Date().toISOString(),
  });
  return runId;
}

/**
 * Project labels this browser has started analyses under — the "choose an
 * existing project label" list on the readiness start step. Kept in its own key
 * so it survives the per-session state resets the flow does on start-over.
 */
export function loadKnownProjects(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(READINESS_PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => v.trim())
      .slice(0, MAX_KNOWN_PROJECTS);
  } catch {
    return [];
  }
}

/** Remember a project label (most-recent first, de-duped); returns the new list. */
export function rememberProjectLabel(label: string): string[] {
  const trimmed = label.trim();
  if (typeof window === "undefined" || !trimmed) return loadKnownProjects();
  const existing = loadKnownProjects().filter((v) => v.toLowerCase() !== trimmed.toLowerCase());
  const next = [trimmed, ...existing].slice(0, MAX_KNOWN_PROJECTS);
  try {
    window.localStorage.setItem(READINESS_PROJECTS_KEY, JSON.stringify(next));
  } catch {
    // Quota / private mode — non-fatal; the run is still recorded server-side.
  }
  return next;
}
