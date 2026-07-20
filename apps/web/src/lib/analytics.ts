/**
 * Privacy-safe first-party analytics.
 * Never attach name, email, phone, free-text, Turnstile tokens, paste contents,
 * or other form PII. All sinks are same-origin / in-page only — no third parties.
 */

/** Canonical readiness instrumentation events (must appear in served JS). */
export const READINESS_ANALYTICS_EVENTS = [
  "stage_started",
  "stage_completed",
  "prompt_copied",
  "prompt_emailed",
  "fallback_taken",
  "paste_attempted",
  "secret_scan_blocked",
  "parse_success",
  "parse_normalized",
  "parse_failed",
  "session_resumed",
  "gate_completed",
  "bucket_assigned",
  "cta_clicked",
  "off_ramp_hit",
  "ingest_landed",
  "ingest_expired",
  "start_over",
] as const;

export type ReadinessAnalyticsEventName = (typeof READINESS_ANALYTICS_EVENTS)[number];

export type AnalyticsEventName =
  | "waitlist_form_view"
  | "waitlist_step_change"
  | "waitlist_validation_failure"
  | "waitlist_submit"
  | "waitlist_success"
  | "waitlist_duplicate"
  | "waitlist_failure"
  | "waitlist_turnstile_degraded"
  | "availability_view"
  | "availability_retry"
  | ReadinessAnalyticsEventName;

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
  /^(name|fullName|email|phone|telephone|message|description|token|turnstile|password|company|productUrl|role|paste|pasteText|textarea|prompt|body|content|raw)$/i;

/** Free-text / credential-shaped values must never leave the client via analytics. */
const FORBIDDEN_VALUE_PATTERN =
  /\b(AKIA[0-9A-Z]{16}|sk[-_](?:live|test)[_-]?[A-Za-z0-9]{8,}|postgres(?:ql)?:\/\/|-----BEGIN )/i;

function sanitizeProps(
  props?: Record<string, string | number | boolean | null | undefined>,
): Record<string, string | number | boolean | null> | undefined {
  if (!props) return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(props)) {
    if (PII_KEY_PATTERN.test(key)) continue;
    if (value === undefined) continue;
    if (typeof value === "string") {
      if (value.includes("@")) continue;
      if (value.length > 120) continue;
      if (FORBIDDEN_VALUE_PATTERN.test(value)) continue;
    }
    out[key] = value;
  }
  return out;
}

/** Same-origin path for first-party analytics beacons (never a third-party domain). */
function analyticsBeaconUrl(): string {
  if (typeof window === "undefined") return "/v1/analytics";
  return `${window.location.origin}/v1/analytics`;
}

function emitBeacon(payload: AnalyticsPayload): void {
  try {
    const body = JSON.stringify({
      event: payload.event,
      props: payload.props ?? {},
      ts: payload.ts,
    });
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(analyticsBeaconUrl(), blob);
      return;
    }
    void fetch(analyticsBeaconUrl(), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body,
      credentials: "same-origin",
      keepalive: true,
      cache: "no-store",
    }).catch(() => {
      /* best-effort */
    });
  } catch {
    /* ignore */
  }
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

  // First-party same-origin beacon so live smoke can observe requests to www.vygo.ai.
  emitBeacon(payload);
}

/**
 * Keep readiness event name strings reachable from a single export so minifiers
 * retain the literals in the client bundle (acceptance: served JS contains names).
 */
export function readinessAnalyticsEventCatalog(): readonly string[] {
  return READINESS_ANALYTICS_EVENTS;
}
