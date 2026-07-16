import { commercialFlags } from "./flags";
import { ctas, ctaHrefs } from "./ctas";

const publicTierPrices = {
  launch: "From $75K",
  scale: "From $145K",
  enterprise: "$275K+",
} as const;

/** Inquiry offer key for free vygo Harden fit assessment. */
export const hardenOfferKey = "harden" as const;

export const pricingContent = {
  flags: commercialFlags,
  page: {
    eyebrow: "ENGAGEMENTS",
    heading: "Simple engagements. Fixed prices.",
    intro:
      "Start with a Production Readiness Audit when you need a defensible plan. Choose Launch, Scale, or Enterprise when you are ready to rebuild on a fixed scope and price with vygo.",
  },
  /** Focused internal-tool engagement — not a full Launch/Scale/Enterprise tier. */
  harden: {
    id: "harden",
    name: "vygo Harden",
    eyebrow: "A SMALLER, FOCUSED ENGAGEMENT",
    headline: "Make your internal tool team-ready.",
    introduction: [
      "Some tools do not need a complete production rebuild. They need the focused engineering work required to move from “the person who built it can use it” to “the team can depend on it.”",
      "vygo Harden is a fixed-price engagement for working internal business tools with a clearly defined workflow and scope.",
    ],
    /**
     * Homepage callout supporting line (best-for framing). Mirrors the Launch /
     * Scale / Enterprise “Best for …” summaries without making Harden a tier card.
     * Derived from the Harden introduction + Good Fit criteria in this module.
     */
    bestFor:
      "Best for working internal business tools with a clearly defined workflow and scope—not a major redesign or full production rebuild.",
    price: "$9,500",
    priceLabel: "$9,500 fixed",
    duration: "About two weeks",
    cta: {
      label: "Start the free assessment",
      href: `${ctaHrefs.waitlist}?offer=${hardenOfferKey}`,
    },
    ctaSupport:
      "We’ll review the tool and tell you whether it fits the vygo Harden scope before you spend anything.",
    examplesIntro:
      "Examples include the following use cases. These examples do not mean every tool or every stack qualifies for vygo Harden.",
    examples: [
      {
        title: "Custom CRM",
        summary: "Built around exactly how your team sells.",
        body: "We can add team accounts, roles, permissions, and reliable hosting so the whole sales team can work from one shared system.",
      },
      {
        title: "Operations tool",
        summary: "Orders, purchasing, inventory, or other internal workflows in one place.",
        body: "We can add access controls, audit history, backups, and deployment safeguards so the team can rely on it every day.",
      },
      {
        title: "Workflow app",
        summary: "Quotes, invoices, approvals, dashboards, or internal handoffs.",
        body: "We can add permissions, recovery, monitoring, and documentation so one mistake does not bring the workflow down.",
      },
    ],
    mayIncludeIntro: "Depending on what the tool needs, a vygo Harden engagement may include:",
    mayInclude: [
      "Team accounts and login",
      "User roles and permissions",
      "Reliable cloud hosting and deployment",
      "Database and configuration cleanup",
      "Backups and basic recovery safeguards",
      "Audit history where appropriate",
      "Logging and basic monitoring",
      "Testing of critical workflows",
      "Technical documentation",
      "Source-code handoff",
    ],
    mayIncludeNote:
      "Scope is confirmed in the free assessment. Not every capability is included in every vygo Harden engagement.",
    goodFit: {
      title: "Good Fit",
      items: [
        "The core tool already works",
        "It supports a specific internal workflow",
        "A team is ready to use it",
        "The required improvements are clearly defined",
        "It does not require a major redesign or rebuild",
      ],
    },
    fullerEngagement: {
      title: "Needs a Fuller Engagement",
      items: [
        "Major new product features",
        "Significant re-architecture",
        "Complex integrations or migrations",
        "Public applications with substantial scale requirements",
        "Formal compliance-readiness work",
        "Enterprise SSO, tenant architecture, or advanced security requirements",
      ],
    },
    closing:
      "Not sure which path fits? Start with the free assessment. If the tool needs more than vygo Harden, we’ll explain why and recommend the appropriate next step.",
    secondaryCta: {
      label: "Explore full production engagements",
      href: "#production-readiness-audit",
    },
    qualificationNote:
      "Qualification for vygo Harden is confirmed before you spend anything. Not every internal tool qualifies.",
  },
  audit: {
    id: "production-readiness-audit",
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
      price: publicTierPrices.launch,
      duration: "6–8 weeks",
      badge: null as string | null,
      summary:
        "Best for a validated product that needs production infrastructure, reliable auth, tests, CI/CD, monitoring, documentation, and a controlled launch.",
      outcomes: [
        "Live production application",
        "Hardened infrastructure and authentication",
        "Automated tests and deployment pipeline",
        "Monitoring and operational runbooks",
        "Full IP handoff",
      ],
    },
    {
      id: "scale",
      name: "Scale",
      price: publicTierPrices.scale,
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
        "Full IP handoff",
      ],
    },
    {
      id: "enterprise",
      name: "Enterprise",
      price: publicTierPrices.enterprise,
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
        "Full IP handoff",
      ],
    },
  ],
  ops: {
    heading: "vygo Ops — after launch",
    intro:
      "The same team that rebuilt the product can stay accountable for uptime, security, compliance-readiness evidence, and continued feature delivery through vygo Ops.",
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
  cta: { label: ctas.applyNextOpening, href: ctaHrefs.waitlist },
} as const;
