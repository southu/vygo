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
      "vygo re-engineers validated AI-built products into secure, scalable, compliance-ready software. Senior U.S.-based production engineering with fixed-price engagements and full IP handoff.",
    auditTitle: "Production Readiness Audit for AI-Built Apps",
    auditDescription:
      "A two-week Production Readiness Audit for AI-built products: prioritized findings, keep-versus-rebuild map, and a fixed-price plan.",
    methodTitle: "Production Rebuild Method",
    methodDescription:
      "A fixed six-step methodology from Production Readiness Audit through rebuild, hardening, compliance readiness, and operations.",
    securityTitle: "Security and Compliance Readiness for AI-Built Software",
    securityDescription:
      "Security controls, identity, data protection, offensive testing, and compliance readiness built into production engineering.",
    pricingTitle: "Engagement Pricing",
    pricingDescription:
      "Fixed-price Production Readiness Audit, Launch, Scale, and Enterprise rebuild engagements, plus ongoing vygo Ops plans.",
    waitlistTitle: "Apply for the next production opening",
    waitlistDescription:
      "Apply for the next Production Readiness Audit or production engineering opening with vygo.",
    insightsTitle: "Insights",
    insightsDescription:
      "Prototype teardowns and field notes on production engineering for AI-built software.",
    privacyTitle: "Privacy Policy",
    termsTitle: "Terms of Use",
    thankYouTitle: "Thank you",
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
