import { ctas, ctaHrefs } from "./ctas";

export const securityContent = {
  hero: {
    headline: "The security controls buyers ask about, built into the product they are buying.",
    body: "VYGO treats security, evidence, and operations as engineering work—not paperwork added after launch.",
  },
  sections: [
    {
      title: "Application security",
      items: [
        "Threat modeling",
        "Secure code review",
        "SAST and dependency scanning",
        "Secrets scanning",
        "DAST where appropriate",
        "Input validation and safe error handling",
      ],
    },
    {
      title: "Identity and access",
      items: [
        "SSO and SAML for applicable tiers",
        "MFA",
        "Role-based access control",
        "Least privilege",
        "Service-account controls",
        "Audit logging",
      ],
    },
    {
      title: "Data protection",
      items: [
        "Tenant isolation",
        "Row-level access where appropriate",
        "Encryption in transit and at rest",
        "Data classification",
        "Retention and deletion controls",
        "Tested backups and recovery",
      ],
    },
    {
      title: "Infrastructure",
      items: [
        "Infrastructure as code",
        "Environment separation",
        "Network boundaries",
        "WAF strategy where appropriate",
        "No long-lived cloud credentials where feasible",
        "Policy and configuration scanning",
      ],
    },
    {
      title: "Offensive testing",
      items: [
        "Threat-model validation",
        "Third-party penetration-test coordination on applicable tiers",
        "Remediation and retest",
        "Load and failure testing",
      ],
    },
    {
      title: "Detection and response",
      items: [
        "Centralized logs",
        "Metrics and traces",
        "Actionable alerts",
        "Incident-response runbooks",
        "Escalation and on-call coverage through the applicable Ops plan",
      ],
    },
  ],
  complianceNote:
    "Certification and attestation decisions are made by independent auditors or certification bodies. VYGO prepares the product and operating program for compliance readiness; readiness work does not guarantee certification or attestation.",
  language: {
    use: [
      "SOC 2 readiness",
      "ISO 27001 pathway",
      "audit support",
      "evidence automation",
      "control implementation",
      "compliance readiness",
    ],
    avoid: ["Guaranteed compliant", "Instant SOC 2", "Certified by vygo"],
  },
  cta: { label: ctas.applyNextOpening, href: ctaHrefs.waitlist },
  secondaryCta: { label: ctas.reviewSecurityControls, href: "#controls" },
} as const;
