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
  /** Explore-CTA button label, arrow-terminated. */
  ctaLabel: string;
  /** Destination on the pricing page for the mapped package. */
  href: string;
};

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
    ctaLabel: "Explore the Scale Package →",
    href: "/pricing",
  },
  Reliability: {
    painPoint: "Single points of failure like this turn small errors into customer-facing outages.",
    packageName: "Launch",
    ctaLabel: "Explore the Launch Package →",
    href: "/pricing",
  },
  Operability: {
    painPoint: "Thin deploy and observability coverage here means incidents surface late.",
    packageName: "vygo Harden",
    ctaLabel: "Explore the vygo Harden Package →",
    href: "/pricing#harden",
  },
  Maintainability: {
    painPoint: "Structural gaps like this compound into slower, riskier changes over time.",
    packageName: "Production Readiness Audit",
    ctaLabel: "Explore the Production Readiness Audit →",
    href: "/pricing#production-readiness-audit",
  },
  "Compliance posture": {
    painPoint: "Compliance gaps like this stall security reviews and enterprise deals.",
    packageName: "Enterprise",
    ctaLabel: "Explore the Enterprise Package →",
    href: "/pricing",
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
  ctaLabel: "Explore the Production Readiness Audit →",
  href: "/pricing#production-readiness-audit",
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
