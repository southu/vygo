import { brand } from "@vygo/ui";
import { commercialFlags } from "./flags";
import { ctas, ctaHrefs } from "./ctas";

export const site = {
  name: brand.name,
  domain: brand.domain,
  email: brand.email,
  tagline: brand.tagline,
  promise: brand.promise,
  positioning: brand.positioning,
  metadata: {
    homeTitle: "vygo.ai — Production Engineering for AI-Built Software",
    homeDescription:
      "vygo, operated by VYGO LLC, re-engineers validated AI-built products into secure, scalable software with compliance readiness. Senior U.S.-based production engineering with fixed-price work after audit and full IP handoff under a separately executed agreement with VYGO LLC. Services begin only under that agreement. Questions, privacy requests, or legal notices may be sent to hello@vygo.ai. Notices are effective when received.",
    auditTitle: "Production Readiness Audit for AI-Built Apps",
    auditDescription:
      "A two-week Production Readiness Audit from vygo, operated by VYGO LLC: prioritized findings, keep-versus-rebuild map, and a fixed-price plan for AI-built products. Rebuild services begin only under a separately executed agreement with VYGO LLC. Questions, privacy requests, or legal notices may be sent to hello@vygo.ai. Notices are effective when received.",
    methodTitle: "Production Rebuild Method",
    methodDescription:
      "The vygo production rebuild method, operated by VYGO LLC: a fixed six-step path from Production Readiness Audit through rebuild, hardening, compliance readiness, and operations. Services begin only under a separately executed agreement with VYGO LLC. Questions, privacy requests, or legal notices may be sent to hello@vygo.ai. Notices are effective when received.",
    securityTitle: "Security and Compliance Readiness for AI-Built Software",
    securityDescription:
      "Security controls, identity, data protection, offensive testing, and compliance readiness built into production engineering by vygo, operated by VYGO LLC. Client services begin only under a separately executed agreement with VYGO LLC. Questions, privacy requests, or legal notices may be sent to hello@vygo.ai. Notices are effective when received.",
    pricingTitle: "Engagement Pricing",
    pricingDescription:
      "Fixed-price Production Readiness Audit, Launch, Scale, and Enterprise rebuild engagements from vygo, operated by VYGO LLC, plus ongoing Ops plans. Services begin only under a separately executed agreement with VYGO LLC. Questions, privacy requests, or legal notices may be sent to hello@vygo.ai. Notices are effective when received.",
    waitlistTitle: "Apply for the next production opening",
    waitlistDescription:
      "Apply for the next Production Readiness Audit or production engineering opening with vygo, operated by VYGO LLC. VYGO LLC reviews applications against available openings. Submitting does not form a client relationship. Services begin only under a separately executed agreement with VYGO LLC. Questions, privacy requests, or legal notices may be sent to hello@vygo.ai. Notices are effective when received.",
    insightsTitle: "Insights",
    insightsDescription:
      "Prototype teardowns and field notes on production engineering for AI-built software from vygo, operated by VYGO LLC. Questions, privacy requests, or legal notices may be sent to hello@vygo.ai. Notices are effective when received.",
    privacyTitle: "Privacy Policy",
    privacyDescription:
      "Privacy Policy for VYGO LLC explaining how vygo.ai collects, uses, and protects personal information from the marketing site and waitlist.",
    termsTitle: "Terms of Use",
    termsDescription:
      "Terms of Use for the vygo.ai website and waitlist features operated by VYGO LLC, a Michigan limited liability company.",
    thankYouTitle: "Thank you",
    thankYouDescription:
      "Thank you for applying to the next production opening with vygo, operated by VYGO LLC. Submitting does not form a client relationship. Services begin only under a separately executed agreement with VYGO LLC. Questions, privacy requests, or legal notices may be sent to hello@vygo.ai. Notices are effective when received.",
  },
} as const;

export type NavItem = {
  href: string;
  label: string;
  /** When false, hide from public navigation. */
  enabled?: boolean;
};

/** Primary header links required by IA and acceptance tests. */
export function getPrimaryNav(): NavItem[] {
  const items: NavItem[] = [
    { href: "/audit", label: "Audit" },
    { href: "/method", label: "Method" },
    { href: "/security", label: "Security" },
  ];

  if (commercialFlags.showPublicPricing) {
    items.push({ href: "/pricing", label: "Pricing" });
  }

  items.push({ href: "/waitlist", label: "Waitlist" });

  return items;
}

export function getHeaderPrimaryCta() {
  return {
    label: ctas.applyNextOpening,
    href: ctaHrefs.waitlist,
  };
}

export function getFooterNav(): NavItem[] {
  const items: NavItem[] = [
    { href: "/audit", label: "Audit" },
    { href: "/method", label: "Method" },
    { href: "/security", label: "Security" },
  ];

  if (commercialFlags.showPublicPricing) {
    items.push({ href: "/pricing", label: "Pricing" });
  }

  items.push(
    { href: "/waitlist", label: "Waitlist" },
    { href: "/privacy", label: "Privacy" },
    { href: "/terms", label: "Terms" },
  );

  return items;
}
