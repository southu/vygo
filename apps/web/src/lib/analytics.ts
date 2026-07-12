/**
 * Privacy-safe analytics for waitlist + availability UI.
 * Never attach name, email, phone, free-text, Turnstile tokens, or other form PII.
 */

export type AnalyticsEventName =
  | "waitlist_form_view"
  | "waitlist_step_change"
  | "waitlist_validation_failure"
  | "waitlist_submit"
  | "waitlist_success"
  | "waitlist_duplicate"
  | "waitlist_failure"
  | "availability_view"
  | "availability_retry";

export type AnalyticsPayload = {
  event: AnalyticsEventName;
  /** Non-PII metadata only (step index, status codes, field *names*, etc.). */
  props?: Record<string, string | number | boolean | null | undefined>;
  ts: number;
};

declare global {
  interface Window {
    __vygoAnalytics?: AnalyticsPayload[];
    dataLayer?: Array<Record<string, unknown>>;
  }
}

const PII_KEY_PATTERN =
  /^(name|fullName|email|phone|telephone|message|description|token|turnstile|password|company|productUrl|role)$/i;

function sanitizeProps(
  props?: Record<string, string | number | boolean | null | undefined>,
): Record<string, string | number | boolean | null> | undefined {
  if (!props) return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(props)) {
    if (PII_KEY_PATTERN.test(key)) continue;
    if (value === undefined) continue;
    if (typeof value === "string" && value.includes("@")) continue;
    out[key] = value;
  }
  return out;
}

export function trackAnalytics(
  event: AnalyticsEventName,
  props?: Record<string, string | number | boolean | null | undefined>,
): void {
  if (typeof window === "undefined") return;

  const payload: AnalyticsPayload = {
    event,
    props: sanitizeProps(props),
    ts: Date.now(),
  };

  if (!window.__vygoAnalytics) {
    window.__vygoAnalytics = [];
  }
  window.__vygoAnalytics.push(payload);

  // Optional GTM-style sink — never spreads raw form values.
  if (Array.isArray(window.dataLayer)) {
    window.dataLayer.push({
      event: `vygo_${event}`,
      vygo_event: event,
      ...payload.props,
    });
  }

  try {
    window.dispatchEvent(new CustomEvent("vygo:analytics", { detail: payload }));
  } catch {
    // ignore
  }
}
