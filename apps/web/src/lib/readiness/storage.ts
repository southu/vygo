/** localStorage helpers for the readiness flow (multi-tab + next-day resume). */

import type { ReadinessStage1Answers } from "@vygo/validation";

export const READINESS_STORAGE_KEY = "vygo:readiness:v1" as const;

export type ReadinessLocalState = {
  token: string | null;
  stage: string;
  stage1: Partial<ReadinessStage1Answers>;
  email?: string;
  offRampKind?: "not_built_yet" | "features_only" | null;
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
