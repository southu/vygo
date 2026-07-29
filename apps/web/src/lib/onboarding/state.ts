/**
 * First-run onboarding completion marker.
 *
 * Static-export site with no per-user backend, so the completion marker lives in
 * the browser (localStorage) — the same durable-client pattern the readiness
 * flow uses. Only a boolean + outcome + step count are stored; no PII.
 */

export const ONBOARDING_STORAGE_KEY = "vygo:onboarding:v1" as const;

export type OnboardingOutcome = "completed" | "skipped";

export type OnboardingState = {
  done: boolean;
  outcome: OnboardingOutcome | null;
  /** Index of the last step the user reached (0-based). */
  lastStep: number;
};

export const INITIAL_ONBOARDING_STATE: OnboardingState = {
  done: false,
  outcome: null,
  lastStep: 0,
};

export function loadOnboardingState(): OnboardingState {
  if (typeof window === "undefined") return { ...INITIAL_ONBOARDING_STATE };
  try {
    const raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return { ...INITIAL_ONBOARDING_STATE };
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    return {
      done: typeof parsed.done === "boolean" ? parsed.done : false,
      outcome:
        parsed.outcome === "completed" || parsed.outcome === "skipped" ? parsed.outcome : null,
      lastStep: typeof parsed.lastStep === "number" ? parsed.lastStep : 0,
    };
  } catch {
    return { ...INITIAL_ONBOARDING_STATE };
  }
}

export function saveOnboardingState(state: OnboardingState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota / private mode — non-fatal.
  }
}
