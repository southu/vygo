/**
 * Shared analytics-consent reader for the conversion layer.
 *
 * Reuses the existing `vygo:consent` localStorage contract written by the
 * campaign consent control. Analytics and paid-media attribution beacons must
 * be gated on this state; functional session continuity (preserved campaign
 * parameters) is intentionally NOT gated so the experience keeps working with
 * analytics denied.
 */

export const CONSENT_STORAGE_KEY = "vygo:consent";

/** Dispatched on the window when the user updates their consent choice. */
export const CONSENT_CHANGE_EVENT = "vygo:consent-change";

type ConsentState = { analytics?: boolean };

/** Pure parse of the stored consent blob → analytics-consent boolean. */
export function parseAnalyticsConsent(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as ConsentState;
    return Boolean(parsed?.analytics);
  } catch {
    return false;
  }
}

/** True only when the user has explicitly allowed optional product analytics. */
export function hasAnalyticsConsent(): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    return parseAnalyticsConsent(window.localStorage.getItem(CONSENT_STORAGE_KEY));
  } catch {
    return false;
  }
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
