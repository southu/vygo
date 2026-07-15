/**
 * Inquiry offer keys used by waitlist/apply CTAs.
 * Harden is a free fit assessment — not the $15K Production Readiness Audit.
 */

export const INQUIRY_OFFER_KEYS = ["harden", "audit", "build", "general"] as const;

export type InquiryOfferKey = (typeof INQUIRY_OFFER_KEYS)[number];

export function isInquiryOfferKey(value: string | null | undefined): value is InquiryOfferKey {
  return Boolean(value && (INQUIRY_OFFER_KEYS as readonly string[]).includes(value));
}

export function parseOfferFromSearch(search: string | null | undefined): InquiryOfferKey | null {
  if (!search) return null;
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const raw = params.get("offer");
  return isInquiryOfferKey(raw) ? raw : null;
}

export function parseOfferFromHref(href: string): InquiryOfferKey | null {
  try {
    const url = new URL(href, "https://vygo.ai");
    return parseOfferFromSearch(url.search);
  } catch {
    return null;
  }
}

export const inquiryOfferOptions: ReadonlyArray<{ value: InquiryOfferKey; label: string }> = [
  { value: "harden", label: "vygo Harden assessment" },
  { value: "audit", label: "Production Readiness Audit" },
  { value: "build", label: "Build engagement (Launch / Scale / Enterprise)" },
  { value: "general", label: "Not sure yet" },
] as const;

export const hardenInquiryCopy = {
  inquiryName: "vygo Harden assessment",
  heading: "vygo Harden assessment",
  body: "You are applying for a free fit assessment for vygo Harden—not the $15,000 Production Readiness Audit. We’ll review your tool and confirm whether it fits the Harden scope before you spend anything.",
  submitLabel: "Submit free assessment",
  successHeading: "Assessment request received.",
  successBody:
    "Thanks for applying for a free vygo Harden fit assessment. We’ll review your tool against the Harden scope and follow up with next steps. This is not an application for the $15,000 Production Readiness Audit.",
} as const;
