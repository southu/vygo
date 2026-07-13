import { ctas, ctaHrefs } from "./ctas";

export const auditContent = {
  hero: {
    headline: "A two-week plan for getting your product safely into production.",
    body: "Before you commit to a rebuild, senior engineers at vygo, operated by VYGO LLC, inspect the code, data model, access controls, infrastructure, deployment process, and operational risks. You leave with a prioritized report and a fixed-price path forward.",
    price: "$15K · credited toward a subsequent vygo build",
    cta: { label: ctas.applyNextAuditOpening, href: ctaHrefs.waitlist },
  },
  whoFor: {
    heading: "Who the audit is for",
    body: "The audit is a strong fit when the product has one or more of:",
    items: [
      "Real users",
      "Revenue or a credible path to revenue",
      "Sensitive or customer-owned data",
      "A blocked enterprise opportunity",
      "Reliability or security incidents",
      "A planned migration from prototype infrastructure",
      "A team that needs a maintainable handoff",
    ],
  },
  reviews: {
    heading: "What vygo reviews",
    categories: [
      "Product architecture",
      "Data model and migrations",
      "Authentication and authorization",
      "Tenant isolation and row-level access",
      "API boundaries and background jobs",
      "Secrets and configuration",
      "CI/CD and environments",
      "Test coverage and failure modes",
      "Logging, metrics, tracing, and alerting",
      "Backups and disaster recovery",
      "Dependency and supply-chain risk",
      "Compliance-readiness gaps relevant to the target customer",
    ],
  },
  receives: {
    heading: "What the customer receives",
    items: [
      "Codebase and architecture assessment",
      "Threat model and security findings",
      "Keep-versus-rebuild map",
      "Data and access-control review",
      "Production architecture blueprint",
      "Compliance-readiness gap analysis where relevant",
      "Prioritized remediation roadmap",
      "Locked scope and fixed-price proposal",
    ],
  },
  timeline: {
    heading: "What happens during the two weeks",
    steps: [
      {
        title: "Intake and access",
        body: "Share repositories, environments, architecture notes, and commercial constraints so the review starts with real context.",
      },
      {
        title: "Technical inspection",
        body: "Senior engineers review code, data, access, infrastructure, deployments, and operational risk with a production lens.",
      },
      {
        title: "Findings and plan",
        body: "You receive a prioritized report, keep-versus-rebuild map, and a fixed-price proposal for the rebuild path you choose.",
      },
    ],
  },
  riskCategories: {
    heading: "Sample risk categories",
    items: [
      "Authentication and authorization gaps",
      "Tenant isolation weaknesses",
      "Unowned infrastructure and secrets",
      "Missing automated tests and deploy safety",
      "Observability and incident readiness gaps",
      "Compliance evidence shortfalls for buyer reviews",
    ],
  },
  scope: {
    heading: "How the fixed-price build scope is created",
    body: "The audit converts findings into a concrete keep-versus-rebuild map, ordered workstreams, and a locked price. You decide whether to proceed; the report remains yours either way. Rebuild services begin only under a separately executed agreement with VYGO LLC.",
  },
  cta: { label: ctas.applyNextAuditOpening, href: ctaHrefs.waitlist },
} as const;
