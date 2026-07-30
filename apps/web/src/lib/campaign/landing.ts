/**
 * Shared helpers for wiring the conversion layer onto campaign landing pages.
 *
 * The configuration-driven landing route (`/campaign/[slug]`) self-instruments
 * through {@link CampaignShell}. The paid-campaign landing surfaces that live
 * under the `/campaigns` path are plain server pages, so they are instrumented
 * globally from the root layout via {@link CampaignConversionBootstrap}. These
 * pure helpers decide which paths are globally instrumented and derive a stable,
 * non-empty `cta_location` for whatever primary CTA the visitor activates.
 */

/**
 * True for the campaign landing surfaces instrumented globally from the root
 * layout (the `/campaigns` path). The singular `/campaign/[slug]` route is
 * intentionally excluded: it self-instruments through its own shell, so double
 * wiring (and duplicate non-deduped CTA events) is avoided.
 */
export function isInstrumentedLandingPath(pathname: string): boolean {
  if (!pathname) return false;
  return pathname === "/campaigns" || pathname.startsWith("/campaigns/");
}

/** Turn a CTA's visible label into a stable, bounded slug for `cta_location`. */
export function slugifyCtaLabel(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** The primary-CTA candidates a global click listener treats as an activation. */
export const PRIMARY_CTA_SELECTOR =
  "[data-cta-location],[data-cta],.btn-primary,[data-analytics-cta],[data-testid$='-cta']";

export type CtaDescriptor = {
  ctaLocation?: string | null;
  cta?: string | null;
  testid?: string | null;
  text?: string | null;
  tag?: string | null;
};

/**
 * Resolve a stable, non-empty `cta_location` from a CTA's attributes. An
 * explicit `data-cta-location` / `data-cta` / `data-testid` always wins; a
 * slug of the visible label is the stable fallback; the element tag is the
 * last resort so the value is never empty.
 */
export function resolveCtaLocation(descriptor: CtaDescriptor): string {
  const explicit = (descriptor.ctaLocation || descriptor.cta || descriptor.testid || "").trim();
  if (explicit) return explicit;
  const fromText = slugifyCtaLabel(descriptor.text ?? "");
  if (fromText) return fromText;
  const tag = (descriptor.tag ?? "").toLowerCase();
  return tag || "primary_cta";
}
