/** localStorage helpers for the readiness flow (multi-tab + next-day resume). */

import { EMPTY_STAGE1, freshReadinessRun } from "@vygo/validation";
import type { ManualAnswers, ReadinessStage1Answers } from "@vygo/validation";

export const READINESS_STORAGE_KEY = "vygo:readiness:v1" as const;
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
