import { commercialFlags } from "./flags";
import { ctas, ctaHrefs } from "./ctas";

export const homepage = {
  hero: {
    eyebrow: "PRODUCTION ENGINEERING FOR AI-BUILT SOFTWARE",
    headline: "From working prototype to production-grade company.",
    supporting:
      "You already proved people want the product. vygo preserves the UX and workflows your users validated, then re-engineers the foundation for security, scale, compliance readiness, and real operations.",
    proofLine: commercialFlags.showUsBasedClaim
      ? "Senior U.S.-based engineers · Fixed price · 6–20 weeks · Full IP handoff"
      : "Senior engineers · Fixed price · 6–20 weeks · Full IP handoff",
    primaryCta: { label: ctas.applyNextOpening, href: ctaHrefs.waitlist },
    secondaryCta: { label: ctas.seeHowRebuildWorks, href: ctaHrefs.method },
    toolLine:
      "Built for products created with Lovable, Cursor, Replit, Bolt, v0, and other AI-native stacks.",
    diagramCaption: "Keep the product. Replace the fragility.",
    validated: {
      title: "Validated prototype",
      items: ["Working UX", "Real user workflows", "Product knowledge", "Fast iteration"],
    },
    pipelineLabel: "vygo production layer",
    production: {
      title: "Production platform",
      items: [
        "Typed APIs",
        "Hardened Postgres",
        "SSO / RBAC / MFA",
        "CI/CD + automated tests",
        "IaC + separate environments",
        "Logs, metrics, tracing, alerts",
      ],
    },
  },
  pains: {
    heading: "Growing pains are proof it’s working.",
    intro:
      "A prototype is supposed to prove demand quickly. When real users, sensitive data, enterprise buyers, and operational pressure arrive, the engineering requirements change. That is not a product failure. It is the next stage.",
    cards: [
      {
        title: "“It broke when real customers showed up.”",
        body: "That is traction. The product proved its value; now the infrastructure has to survive demand. We rebuild the parts that were never meant to carry production load.",
      },
      {
        title: "“A security questionnaire is blocking the deal.”",
        body: "The buyer already wants the product. We implement the controls, evidence, logging, access model, and operating practices needed to move the review forward.",
      },
      {
        title: "“IT will not approve the rollout.”",
        body: "SSO, role-based access, audit trails, tenant isolation, backups, and documented operations turn a useful app into a platform IT can evaluate seriously.",
      },
      {
        title: "“Only one person understands the code.”",
        body: "Tests, documentation, clean boundaries, repeatable deployments, and runbooks let a team carry the product forward without losing what made it valuable.",
      },
    ],
    closing:
      "You did the hardest thing in software: proved people want it. What remains is production engineering.",
  },
  keepReplace: {
    heading: "The work you already did is the head start.",
    intro:
      "Your prototype contains months of decisions, user feedback, edge cases, and product learning. We treat that as valuable discovery—not as something to erase.",
    keepTitle: "We keep",
    keep: [
      "The validated UX",
      "User-approved workflows",
      "Product rules and domain knowledge",
      "Features that have proven demand",
      "Useful data, migrated safely",
      "The speed and clarity of the original idea",
    ],
    replaceTitle: "We replace or harden",
    replace: [
      "Auto-generated monoliths without clear contracts",
      "Open or inconsistent data-access rules",
      "Fragile authentication and missing authorization",
      "One-click infrastructure with no environment separation",
      "Manual deployments and absent test coverage",
      "Console-log debugging and missing incident response",
      "Long-lived credentials and unmanaged secrets",
    ],
    closing:
      "Your MVP is the discovery phase, done. We begin with answers instead of spending months rediscovering the product.",
  },
  capabilities: {
    heading: "The production layer AI tools do not provide by themselves.",
    cards: [
      {
        title: "Production engineering",
        body: "Typed services, versioned APIs, reliable background jobs, automated tests, code review, CI/CD, and maintainable architecture.",
      },
      {
        title: "Security by design",
        body: "Threat modeling, secure defaults, SAST and dependency scanning, secrets management, least privilege, and remediation before launch.",
      },
      {
        title: "Identity and access",
        body: "SSO and SAML where required, MFA, role-based access control, tenant isolation, service-account discipline, and full audit trails.",
      },
      {
        title: "Compliance readiness",
        body: "SOC 2 and ISO 27001 control implementation, evidence workflows, policies, audit support, and independent penetration-test coordination.",
      },
      {
        title: "Scale and reliability",
        body: "Infrastructure as code, separate environments, autoscaling strategy, performance testing, observability, SLOs, backups, and disaster-recovery planning.",
      },
      {
        title: "A codebase your team can own",
        body: "Architecture documentation, runbooks, test suites, deployment instructions, and full ownership of the code, infrastructure, and IP at handoff.",
      },
    ],
  },
  methodPreview: {
    heading: "A fixed methodology, not open-ended consulting.",
    steps: [
      {
        title: "Audit",
        weeks: "Weeks 1–2",
        body: "Codebase, security, data, architecture, and operational assessment. Deliver a findings report and fixed-price plan.",
      },
      {
        title: "Architect",
        weeks: "Weeks 2–4",
        body: "Define the target architecture, data model, environments, delivery pipeline, security boundaries, and compliance roadmap.",
      },
      {
        title: "Rebuild",
        weeks: "Weeks 4–10",
        body: "Re-engineer core services and migrate data while preserving the validated UX and product behavior.",
      },
      {
        title: "Harden",
        weeks: "Weeks 8–12",
        body: "Run security, load, failure, backup, and recovery testing. Add observability, alerting, and operational controls.",
      },
      {
        title: "Certify-ready",
        weeks: "Weeks 10–16",
        body: "Implement policies and evidence workflows, support the audit process, and coordinate required third-party testing.",
      },
      {
        title: "Operate",
        weeks: "Ongoing",
        body: "Keep the platform secure, compliant, observable, and moving through vygo Ops.",
      },
    ],
    cta: { label: ctas.viewFullMethod, href: ctaHrefs.method },
  },
  auditOffer: {
    eyebrow: "START HERE",
    heading: "Know exactly what has to change before you fund the rebuild.",
    body: "The Production Readiness Audit is a two-week review of your code, architecture, security, scalability, and compliance gaps. You receive a prioritized findings report and a fixed-price plan. The report is yours to keep either way.",
    priceLine: "$15K · credited toward your build",
    deliverables: [
      "Codebase and architecture assessment",
      "Threat model and security findings",
      "Keep-versus-rebuild map",
      "Data and access-control review",
      "Production architecture blueprint",
      "Compliance gap analysis where relevant",
      "Prioritized remediation roadmap",
      "Locked scope and fixed-price proposal",
    ],
    cta: { label: ctas.applyNextAuditOpening, href: ctaHrefs.waitlist },
  },
  pricingPreview: {
    heading: "Simple engagements. Fixed prices.",
    // Editorial: exact equity % / cash premiums stay behind commercialFlags.showExactEquityTerms
    // (and showCashOnlyPremium). Do not put author instructions in rendered note copy.
    note: "Standard engagements can include an equity-aligned structure. Cash-only pricing is available. Exact equity percentages and cash-only premiums are published only after legal counsel approves the public wording.",
    cta: { label: ctas.reviewEngagementDetails, href: ctaHrefs.pricing },
  },
  securityPreview: {
    heading: "Security is not a handoff checklist. It is part of the build.",
    groups: [
      "Application security",
      "Identity and access",
      "Data protection",
      "Infrastructure security",
      "Offensive testing",
      "Detection and response",
    ],
    cta: { label: ctas.reviewSecurityApproach, href: ctaHrefs.security },
  },
  ops: {
    heading: "We do not disappear at launch.",
    body: "The same team that rebuilt the product can stay accountable for uptime, security, compliance evidence, and continued feature delivery.",
    plans: [
      { name: "Keep It Running", price: "$8K/month" },
      { name: "Keep It Compliant", price: "$15K/month" },
      { name: "Keep It Growing", price: "$25K/month" },
    ],
    note: "Month-to-month after the initial commitment. Everything remains documented so another qualified team can take over.",
  },
  why: {
    heading: "Senior people on the work. Accountability after the launch.",
    points: [
      {
        title: "Senior-only delivery",
        body: "No junior bench learning on the product.",
      },
      {
        title: "U.S.-based engineering",
        body: "Engineering delivery is staffed from the United States.",
      },
      {
        title: "Fixed price after audit",
        body: "The audit defines the scope before the build begins.",
      },
      {
        title: "Security and compliance integrated",
        body: "Not sold as a last-minute add-on.",
      },
      {
        title: "Aligned for the long term",
        body: "Ongoing operations and optional equity alignment keep incentives connected.",
      },
    ].filter((p) => {
      if (p.title === "U.S.-based engineering" && !commercialFlags.showUsBasedClaim) return false;
      if (p.title === "Senior-only delivery" && !commercialFlags.showSeniorOnlyClaim) return false;
      return true;
    }),
  },
  finalCta: {
    heading: "Your MVP earned a real launch.",
    body: "Tell us what you built, what is blocking the next stage, and when the deadline matters. We will review the application against the next available Production Readiness Audit and engineering pod.",
    cta: { label: ctas.applyNextOpening, href: ctaHrefs.waitlist },
  },
} as const;
