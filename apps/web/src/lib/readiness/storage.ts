/** localStorage helpers for the readiness flow (multi-tab + next-day resume). */

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
