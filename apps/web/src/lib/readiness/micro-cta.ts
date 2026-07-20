/**
 * Per-pillar micro-CTA copy for the readiness deep dives.
 *
 * Each readiness pillar (radar dimension) is mapped to the single most relevant
 * EXISTING vygo service package from src/content/pricing.ts. None of these
 * package names are invented here — they are the real engagement names
 * (vygo Harden, Production Readiness Audit, Launch, Scale, Enterprise).
 *
 * Visibility is gated by the SAME severity tier used for the sub-metric's
 * styling: this module never re-derives thresholds. The caller passes the tier
 * it already computed via {@link ./severity#scoreSeverity}, and Good-tier
 * sub-metrics resolve to `null` so they render no CTA at all.
 */
import type { SeverityTier } from "./severity";

export type MicroCta = {
  /** Short pain-point sentence shown above the button. */
  painPoint: string;
  /** Name of the existing service package this pillar maps to. */
  packageName: string;
  /**
   * Stable id of the matching pricing card. Doubles as the scroll anchor
   * (`#<packageId>`) and the `highlight` query value the /pricing page reads on
   * load to ring the correct card. Must match a `data-highlight-target` on
   * /pricing (see src/components/PricingHighlight.tsx and src/app/pricing/page.tsx).
   */
  packageId: string;
  /** Explore-CTA button label, arrow-terminated. */
  ctaLabel: string;
  /** Destination on the pricing page for the mapped package. */
  href: string;
};

/** Base path of the engagements/pricing page that hosts the tier cards. */
const PRICING_PATH = "/pricing";

/**
 * Build the cross-page destination for a mapped package: an anchor that lands
 * the viewport on the matching card plus a `highlight` query param the pricing
 * page reads on load to apply the temporary ring/glow (acceptance criteria 3–5).
 */
function pricingHref(packageId: string): string {
  return `${PRICING_PATH}?highlight=${packageId}#${packageId}`;
}

/**
 * Pillar → most-relevant existing package. Keyed by the exact dimension name
 * emitted by the scoring engine (see report-chart-data). Package names and hrefs
 * trace directly to the engagement sections in src/content/pricing.ts and the
 * anchors on /pricing.
 */
const PILLAR_CTAS: Record<string, MicroCta> = {
  Security: {
    painPoint: "Access and isolation gaps like this are exactly what attackers probe first.",
    packageName: "Scale",
    packageId: "scale",
    ctaLabel: "Explore the Scale Package →",
    href: pricingHref("scale"),
  },
  Reliability: {
    painPoint: "Single points of failure like this turn small errors into customer-facing outages.",
    packageName: "Launch",
    packageId: "launch",
    ctaLabel: "Explore the Launch Package →",
    href: pricingHref("launch"),
  },
  Operability: {
    painPoint: "Thin deploy and observability coverage here means incidents surface late.",
    packageName: "vygo Harden",
    packageId: "harden",
    ctaLabel: "Explore the vygo Harden Package →",
    href: pricingHref("harden"),
  },
  Maintainability: {
    painPoint: "Structural gaps like this compound into slower, riskier changes over time.",
    packageName: "Production Readiness Audit",
    packageId: "production-readiness-audit",
    ctaLabel: "Explore the Production Readiness Audit →",
    href: pricingHref("production-readiness-audit"),
  },
  "Compliance posture": {
    painPoint: "Compliance gaps like this stall security reviews and enterprise deals.",
    packageName: "Enterprise",
    packageId: "enterprise",
    ctaLabel: "Explore the Enterprise Package →",
    href: pricingHref("enterprise"),
  },
};

/**
 * Safe fallback for any pillar without an explicit mapping. The Production
 * Readiness Audit is the real, universally-relevant entry engagement, so an
 * unrecognized dimension still references a genuine package.
 */
const FALLBACK_CTA: MicroCta = {
  painPoint: "Gaps like this are what a focused vygo engagement is built to close.",
  packageName: "Production Readiness Audit",
  packageId: "production-readiness-audit",
  ctaLabel: "Explore the Production Readiness Audit →",
  href: pricingHref("production-readiness-audit"),
};

/**
 * Resolve the micro-CTA for a pillar, or `null` when the sub-metric is in the
 * Good tier (no CTA). The tier is supplied by the caller from the shared
 * severity utility so the CTA's visibility can never disagree with the tier
 * styling already shown on the sub-metric.
 */
export function microCtaForPillar(dimension: string, tier: SeverityTier): MicroCta | null {
  if (tier === "good") return null;
  return PILLAR_CTAS[dimension.trim()] ?? FALLBACK_CTA;
}
