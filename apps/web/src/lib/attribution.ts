/**
 * Permitted waitlist attribution only: UTM params, landing path, document referrer.
 * No fingerprints, geolocation, canvas, storage dumps, or other unapproved data.
 */
import { getCampaignParams } from "./campaign/params";

export type WaitlistAttribution = {
  utm: {
    source: string | null;
    medium: string | null;
    campaign: string | null;
    content: string | null;
    term: string | null;
  };
  landingPage: string;
  referrer: string | null;
};

const UTM_MAX = 128;
/** Server accepts `landingPage` up to 500 chars (WAITLIST_LIMITS.landingPage). */
const LANDING_PAGE_MAX = 500;

function clip(value: string | null): string | null {
  if (value == null || value === "") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > UTM_MAX ? trimmed.slice(0, UTM_MAX) : trimmed;
}

export type CaptureAttributionOptions = {
  /**
   * Preserve the landing page's full query string in `landingPage` (path +
   * search), not just the path. This is how supported click identifiers
   * (gclid, fbclid, wbraid, msclkid, …) — which have no dedicated payload
   * field and are not editable form controls — travel with the waitlist
   * request alongside the UTM object and referrer. Off by default so the
   * existing /waitlist surface keeps its path-only landingPage.
   */
  fullUrl?: boolean;
};

export function captureAttribution(options?: CaptureAttributionOptions): WaitlistAttribution {
  if (typeof window === "undefined") {
    return {
      utm: { source: null, medium: null, campaign: null, content: null, term: null },
      landingPage: "/waitlist",
      referrer: null,
    };
  }

  const params = new URLSearchParams(window.location.search);
  // Explicit values on the current URL win; otherwise fall back to the
  // allowlisted campaign parameters preserved for this browser session, so
  // attribution survives same-origin navigation from a campaign landing page.
  const session = getCampaignParams();
  const pick = (key: "utm_source" | "utm_medium" | "utm_campaign" | "utm_content" | "utm_term") =>
    clip(params.get(key)) ?? clip(session[key] ?? null);
  const path = window.location.pathname || "/waitlist";
  const landingPage = options?.fullUrl
    ? `${path}${window.location.search}`.slice(0, LANDING_PAGE_MAX)
    : path;
  return {
    utm: {
      source: pick("utm_source"),
      medium: pick("utm_medium"),
      campaign: pick("utm_campaign"),
      content: pick("utm_content"),
      term: pick("utm_term"),
    },
    landingPage,
    referrer: clip(document.referrer || null),
  };
}
