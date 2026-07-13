import { commercialFlags } from "./flags";
import { ctas, ctaHrefs } from "./ctas";

export const pricingContent = {
  flags: commercialFlags,
  page: {
    eyebrow: "ENGAGEMENTS",
    heading: "Simple engagements. Fixed prices.",
    intro:
      "Start with a Production Readiness Audit when you need a defensible plan. Choose Launch, Scale, or Enterprise when you are ready to rebuild on a fixed scope and price with vygo, operated by VYGO LLC. Services begin only under a separately executed agreement.",
  },
  audit: {
    name: "Production Readiness Audit",
    price: "$15K",
    duration: "2 weeks",
    summary:
      "A two-week review of code, architecture, security, scalability, and compliance-readiness gaps with a prioritized findings report and fixed-price plan. Credited toward a subsequent vygo build.",
    outcomes: [
      "Codebase and architecture assessment",
      "Threat model and security findings",
      "Keep-versus-rebuild map",
      "Prioritized remediation roadmap",
      "Locked scope and fixed-price proposal",
    ],
    cta: { label: ctas.applyNextAuditOpening, href: ctaHrefs.waitlist },
  },
  tiers: [
    {
      id: "launch",
      name: "Launch",
      price: "From $95K",
      duration: "6–8 weeks",
      badge: null as string | null,
      summary:
        "Best for a validated product that needs production infrastructure, reliable auth, tests, CI/CD, monitoring, documentation, and a controlled launch.",
      outcomes: [
        "Live production application",
        "Hardened infrastructure and authentication",
        "Automated tests and deployment pipeline",
        "Monitoring and operational runbooks",
        "Full IP handoff under a separately executed agreement with VYGO LLC",
      ],
    },
    {
      id: "scale",
      name: "Scale",
      price: "From $185K",
      duration: "10–14 weeks",
      badge: "Most common",
      summary:
        "Best for a growing product that needs re-architecture, stronger access controls, a third-party penetration test, load testing, and SOC 2 Type I readiness work.",
      outcomes: [
        "Everything in Launch",
        "Growth architecture and data migration",
        "RBAC and SSO-ready identity model",
        "Penetration-test report and remediation",
        "Load testing and SLO dashboards",
        "SOC 2 Type I readiness program",
      ],
    },
    {
      id: "enterprise",
      name: "Enterprise",
      price: "$350K+",
      duration: "16–20+ weeks",
      badge: null as string | null,
      summary:
        "Best for complex multi-tenant products, enterprise integrations, SSO/SAML, higher availability requirements, complex migrations, SOC 2 Type II programs, and an ISO 27001 path.",
      outcomes: [
        "Dedicated senior pod",
        "Enterprise access and tenant architecture",
        "SLA-ready infrastructure and disaster recovery",
        "Complex data and integration work",
        "Type II evidence program and auditor coordination",
        "ISO 27001 pathway where required",
      ],
    },
  ],
  ops: {
    heading: "vygo Ops — after launch",
    intro:
      "The same team that rebuilt the product can stay accountable for uptime, security, compliance-readiness evidence, and continued feature delivery through vygo Ops, operated by VYGO LLC.",
    plans: [
      {
        name: "Keep It Running",
        price: "$8K/month",
        includes: [
          "Monitoring and alerting ownership",
          "Incident response support",
          "Security updates and dependency hygiene",
          "Operational runbook upkeep",
        ],
      },
      {
        name: "Keep It Compliant",
        price: "$15K/month",
        includes: [
          "Everything in Keep It Running",
          "Compliance-readiness evidence upkeep",
          "Control drift review",
          "Audit support coordination",
        ],
      },
      {
        name: "Keep It Growing",
        price: "$25K/month",
        includes: [
          "Everything in Keep It Compliant",
          "Ongoing feature engineering capacity",
          "Architecture stewardship",
          "Priority scheduling for product work",
        ],
      },
    ],
    note: "Month-to-month after the initial commitment. Everything remains documented so another qualified team can take over.",
  },
  // Editorial: exact equity % / cash premiums stay behind commercialFlags.showExactEquityTerms
  // (and showCashOnlyPremium). Keep this note visitor-facing; do not add author instructions.
  equityNote:
    "Standard engagements can include an equity-aligned structure. Cash-only pricing is available. Exact equity percentages and cash-only premiums are published only after legal counsel approves the public wording.",
  cta: { label: ctas.applyNextOpening, href: ctaHrefs.waitlist },
} as const;
