/**
 * Shared conversion event contract for campaign landing pages.
 *
 * Every emitted event carries a stable `landing_page_id`, an explicit
 * `cta_location` (or `null` when no CTA applies), the available allowlisted
 * campaign parameters, and a `conversion_outcome`. Analytics/attribution
 * beacons are gated on consent, and duplicate emissions from rerenders,
 * repeated binding, or back/forward navigation are suppressed.
 *
 * Emission is delegated to the existing first-party `trackAnalytics` sink — no
 * new analytics provider is introduced.
 */
import {
  trackAnalytics,
  CAMPAIGN_CONVERSION_EVENTS,
  type CampaignConversionEventName,
} from "../analytics";
import { hasAnalyticsConsent } from "./consent";
import { getCampaignParams, type CampaignParams } from "./params";

export { CAMPAIGN_CONVERSION_EVENTS };
export type ConversionEventName = CampaignConversionEventName;

/** Stable `conversion_outcome` values keyed to each event. */
export type ConversionOutcome =
  "view" | "activated" | "started" | "validation_error" | "submission_rejected" | "success";

export type ConversionEventInput = {
  event: ConversionEventName;
  /** Stable identifier for the landing page / conversion surface. */
  landingPageId: string;
  /** Stable CTA location, or null when the event has no originating CTA. */
  ctaLocation: string | null;
  /** Stable outcome label for the event. */
  outcome: ConversionOutcome;
  /** Allowlisted campaign parameters; defaults to the current session set. */
  params?: CampaignParams;
  /** Extra non-PII metadata (field names, status codes, counts). */
  extra?: Record<string, string | number | boolean | null>;
  /** Disambiguates repeated attempts for dedup (e.g. an application id). */
  dedupeKey?: string;
};

export type ConversionPayload = {
  landing_page_id: string;
  cta_location: string | null;
  conversion_outcome: ConversionOutcome;
} & Record<string, string | number | boolean | null>;

/**
 * Build the canonical, flat conversion payload. The allowlisted campaign
 * parameters are spread as top-level keys so downstream attribution can read
 * them directly. Pure — no I/O, no consent or dedup concerns.
 */
export function buildConversionPayload(input: ConversionEventInput): ConversionPayload {
  const params = input.params ?? getCampaignParams();
  const payload: ConversionPayload = {
    landing_page_id: input.landingPageId,
    cta_location: input.ctaLocation ?? null,
    conversion_outcome: input.outcome,
  };
  for (const [key, value] of Object.entries(params)) {
    if (value) payload[key] = value;
  }
  if (input.extra) {
    for (const [key, value] of Object.entries(input.extra)) {
      payload[key] = value;
    }
  }
  return payload;
}

/**
 * Events that must be emitted at most once for a given key. Landing-page views
 * are unique per landing page; form starts and successful conversions are
 * unique per attempt. CTA activations and error events are intentionally NOT
 * deduped — each genuine activation or failure is a distinct signal.
 */
export function dedupeKeyFor(input: ConversionEventInput): string | null {
  switch (input.event) {
    case "landing_page_view":
      return `landing_page_view:${input.landingPageId}`;
    case "form_start":
      return `form_start:${input.landingPageId}:${input.dedupeKey ?? ""}`;
    case "conversion_success":
      return `conversion_success:${input.landingPageId}:${input.dedupeKey ?? ""}`;
    default:
      return null;
  }
}

export type ConversionEmitter = {
  emit: (input: ConversionEventInput) => boolean;
  reset: () => void;
  hasEmitted: (key: string) => boolean;
};

/**
 * Create an emitter with injectable consent + sink dependencies. Consent is
 * checked before anything is marked as emitted, so a view suppressed under
 * denied consent can still fire exactly once if consent is later granted.
 */
export function createConversionEmitter(deps: {
  hasConsent: () => boolean;
  track: (event: ConversionEventName, payload: ConversionPayload) => void;
}): ConversionEmitter {
  const emitted = new Set<string>();
  return {
    emit(input: ConversionEventInput): boolean {
      if (!deps.hasConsent()) return false;
      const key = dedupeKeyFor(input);
      if (key) {
        if (emitted.has(key)) return false;
        emitted.add(key);
      }
      deps.track(input.event, buildConversionPayload(input));
      return true;
    },
    reset() {
      emitted.clear();
    },
    hasEmitted(key: string): boolean {
      return emitted.has(key);
    },
  };
}

/** Process-wide emitter wired to the real consent reader and analytics sink. */
const emitter = createConversionEmitter({
  hasConsent: hasAnalyticsConsent,
  track: (event, payload) => trackAnalytics(event, payload),
});

/**
 * Emit a conversion event through the shared, consent-gated, deduplicated
 * pipeline. Returns true when the event was actually sent.
 */
export function emitConversionEvent(input: ConversionEventInput): boolean {
  return emitter.emit(input);
}

/** Derive a stable landing_page_id from a pathname (campaign slug aware). */
export function resolveLandingPageId(pathname?: string): string {
  const path = pathname ?? (typeof window !== "undefined" ? window.location.pathname : "/");
  const campaign = path.match(/^\/campaign\/([^/?#]+)/);
  if (campaign && campaign[1]) return campaign[1];
  if (path === "/" || path === "") return "home";
  return path.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\//g, ":");
}
