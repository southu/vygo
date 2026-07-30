/**
 * Shared analytics-consent reader for the conversion layer.
 *
 * Reuses the existing `vygo:consent` localStorage contract written by the
 * campaign consent control. The app's established/default state is
 * "analytics allowed" — the legacy first-party beacons fire unconditionally —
 * so the conversion layer emits by default and is suppressed only when the user
 * has EXPLICITLY denied optional analytics. Functional session continuity
 * (preserved campaign parameters) is never gated, so the experience keeps
 * working even with analytics denied.
 */

export const CONSENT_STORAGE_KEY = "vygo:consent";

/** Dispatched on the window when the user updates their consent choice. */
export const CONSENT_CHANGE_EVENT = "vygo:consent-change";

type ConsentState = { analytics?: boolean };

/**
 * The three possible analytics-consent states:
 *  - `granted`  — the user explicitly turned analytics on.
 *  - `denied`   — the user explicitly turned analytics off.
 *  - `unset`    — no explicit choice recorded; the app default (allowed) stands.
 */
export type ConsentDecision = "granted" | "denied" | "unset";

/** Pure parse of the stored consent blob → an explicit/unset decision. */
export function readAnalyticsConsentDecision(raw: string | null): ConsentDecision {
  if (!raw) return "unset";
  try {
    const parsed = JSON.parse(raw) as ConsentState;
    if (typeof parsed?.analytics === "boolean") return parsed.analytics ? "granted" : "denied";
    return "unset";
  } catch {
    return "unset";
  }
}

/** Pure check: has the user explicitly turned optional analytics ON. */
export function parseAnalyticsConsent(raw: string | null): boolean {
  return readAnalyticsConsentDecision(raw) === "granted";
}

/** True only when the user has EXPLICITLY denied optional analytics. */
export function analyticsConsentDenied(): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    return (
      readAnalyticsConsentDecision(window.localStorage.getItem(CONSENT_STORAGE_KEY)) === "denied"
    );
  } catch {
    return false;
  }
}

/**
 * Whether analytics/attribution beacons may be sent. Default-allow: emission is
 * suppressed only on an explicit denial, matching the app's existing state where
 * the legacy beacons fire unconditionally. Absence of a stored choice keeps the
 * default (allowed) so a normal visit is instrumented without any opt-in UI.
 */
export function hasAnalyticsConsent(): boolean {
  return !analyticsConsentDenied();
}

/**
 * Subscribe to consent changes — both same-tab updates (custom event) and
 * cross-tab updates (storage event). Returns an unsubscribe function.
 */
export function subscribeConsent(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === CONSENT_STORAGE_KEY || event.key === null) callback();
  };
  const onCustom = () => callback();
  window.addEventListener("storage", onStorage);
  window.addEventListener(CONSENT_CHANGE_EVENT, onCustom);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CONSENT_CHANGE_EVENT, onCustom);
  };
}

/** Notify same-tab listeners that consent changed. */
export function notifyConsentChange(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT));
  } catch {
    // CustomEvent unavailable — cross-tab storage listeners still fire.
  }
}
