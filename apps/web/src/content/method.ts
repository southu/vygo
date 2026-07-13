import { ctas, ctaHrefs } from "./ctas";

export const methodContent = {
  hero: {
    heading: "A fixed methodology, not open-ended consulting.",
    principle:
      "The validated product remains visible throughout the rebuild. Customers receive weekly demos and staging access rather than waiting months for a reveal.",
    cutoverNote:
      "Cutover is planned with rollback procedures. Zero-downtime migration is not promised in all cases unless the contract specifically guarantees it.",
  },
  steps: [
    {
      title: "Audit",
      weeks: "Weeks 1–2",
      objectives:
        "Establish a defensible view of risk, keep-versus-rebuild scope, and fixed-price path.",
      activities: [
        "Codebase and architecture review",
        "Security and data access assessment",
        "Operational readiness inspection",
        "Findings report and fixed-price plan",
      ],
      involvement: "Provide access, context, and commercial constraints; review interim findings.",
      deliverables: ["Findings report", "Keep-versus-rebuild map", "Fixed-price proposal"],
      risks: ["Incomplete access slows assessment", "Hidden production dependencies"],
      gate: "Customer accepts, revises, or declines the rebuild plan.",
    },
    {
      title: "Architect",
      weeks: "Weeks 2–4",
      objectives: "Define the target platform without erasing validated product behavior.",
      activities: [
        "Target architecture and data model",
        "Environment and delivery pipeline design",
        "Security boundaries and compliance-readiness roadmap",
      ],
      involvement: "Validate product behavior priorities and environment constraints.",
      deliverables: [
        "Architecture blueprint",
        "Environment plan",
        "Security and compliance-readiness roadmap",
      ],
      risks: ["Unresolved product edge cases", "Third-party constraints"],
      gate: "Architecture and delivery plan approved before rebuild acceleration.",
    },
    {
      title: "Rebuild",
      weeks: "Weeks 4–10",
      objectives: "Re-engineer core services while preserving validated UX and workflows.",
      activities: [
        "Service and API re-engineering",
        "Data migration planning and execution",
        "Weekly demos and staging access",
      ],
      involvement: "Review demos, prioritize product behavior, and validate migrations.",
      deliverables: ["Rebuilt services", "Migrated data paths", "Staging product visibility"],
      risks: ["Data edge cases", "Scope pressure from new feature requests"],
      gate: "Staging product matches agreed behavior for launch candidates.",
    },
    {
      title: "Harden",
      weeks: "Weeks 8–12",
      objectives: "Prove the platform can survive real load, failure, and operational use.",
      activities: [
        "Security, load, failure, backup, and recovery testing",
        "Observability and alerting",
        "Operational control implementation",
      ],
      involvement: "Review risk findings and accept residual-risk decisions.",
      deliverables: ["Test evidence", "Alerting and runbooks", "Hardened environments"],
      risks: ["Late-discovered load issues", "Incomplete operational ownership"],
      gate: "Launch readiness criteria met for the contracted tier.",
    },
    {
      title: "Certify-ready",
      weeks: "Weeks 10–16",
      objectives: "Prepare evidence and operating practices for independent audit processes.",
      activities: [
        "Policies and evidence workflows",
        "Audit process support",
        "Third-party testing coordination where required",
      ],
      involvement: "Provide business policy inputs and auditor access as needed.",
      deliverables: ["Evidence program", "Policy package", "Audit support artifacts"],
      risks: ["Auditor timelines outside engineering control"],
      gate: "Readiness package complete for the contracted compliance path.",
    },
    {
      title: "Operate",
      weeks: "Ongoing",
      objectives: "Keep the platform secure, compliance-ready, observable, and moving.",
      activities: [
        "vygo Ops monitoring and response",
        "Security and compliance-readiness upkeep",
        "Continued feature engineering when contracted",
      ],
      involvement:
        "Product prioritization and operational decision rights remain with the customer.",
      deliverables: ["Operational ownership", "Documented handoff-ready system"],
      risks: ["Unowned production decisions after launch"],
      gate: "Customer may continue Ops or transfer to another qualified team.",
    },
  ],
  tierMatrix: {
    heading: "What changes by tier",
    rows: [
      {
        capability: "Production infrastructure & CI/CD",
        launch: "Included",
        scale: "Included",
        enterprise: "Included + higher availability design",
      },
      {
        capability: "Identity (RBAC / SSO readiness)",
        launch: "Auth foundation",
        scale: "RBAC + SSO-ready",
        enterprise: "Enterprise SSO/SAML + tenant model",
      },
      {
        capability: "Penetration testing",
        launch: "Not default",
        scale: "Third-party coordination",
        enterprise: "Third-party coordination + remediation depth",
      },
      {
        capability: "Compliance path",
        launch: "Baseline controls",
        scale: "SOC 2 Type I readiness",
        enterprise: "Type II program + ISO 27001 pathway",
      },
      {
        capability: "Ops continuity",
        launch: "Optional",
        scale: "Recommended",
        enterprise: "Recommended with dedicated pod options",
      },
    ],
  },
  cta: { label: ctas.applyNextOpening, href: ctaHrefs.waitlist },
  secondaryCta: { label: ctas.startWithAudit, href: ctaHrefs.audit },
} as const;
