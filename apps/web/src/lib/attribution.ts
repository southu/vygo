/**
 * Permitted waitlist attribution only: UTM params, landing path, document referrer.
 * No fingerprints, geolocation, canvas, storage dumps, or other unapproved data.
 */

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

function clip(value: string | null): string | null {
  if (value == null || value === "") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > UTM_MAX ? trimmed.slice(0, UTM_MAX) : trimmed;
}

export function captureAttribution(): WaitlistAttribution {
  if (typeof window === "undefined") {
    return {
      utm: { source: null, medium: null, campaign: null, content: null, term: null },
      landingPage: "/waitlist",
      referrer: null,
    };
  }

  const params = new URLSearchParams(window.location.search);
  return {
    utm: {
      source: clip(params.get("utm_source")),
      medium: clip(params.get("utm_medium")),
      campaign: clip(params.get("utm_campaign")),
      content: clip(params.get("utm_content")),
      term: clip(params.get("utm_term")),
    },
    landingPage: window.location.pathname || "/waitlist",
    referrer: clip(document.referrer || null),
  };
}
