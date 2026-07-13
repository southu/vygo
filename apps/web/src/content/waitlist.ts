import { ctas } from "./ctas";

export const waitlistContent = {
  page: {
    eyebrow: "LIMITED SENIOR-POD CAPACITY",
    headline: "Apply for the next production opening.",
    body: "Tell us what you built, where it is getting stuck, and what deadline matters. We prioritize products with validated demand, active users, sensitive data, or a real commercial opportunity blocked by production risk. VYGO LLC reviews applications against the next available Production Readiness Audit and engineering opening. Submitting does not form a client engagement until a separate agreement is signed. For hard commercial or security-review deadlines, or for privacy requests and legal notices, contact hello@vygo.ai. Notices are effective when received.",
  },
  form: {
    step1Title: "About you and the product",
    step2Title: "What needs to happen",
    /** Labels for UI; values match shared Zod enums. */
    stages: [
      { value: "prototype", label: "Working prototype" },
      { value: "private_beta", label: "Private beta" },
      { value: "live_users", label: "Live with users" },
      { value: "revenue", label: "Generating revenue" },
      { value: "enterprise_pipeline", label: "Enterprise deal or rollout in progress" },
    ],
    blockers: [
      { value: "reliability_scale", label: "Reliability and scale" },
      { value: "security", label: "Security risk" },
      { value: "security_compliance", label: "Compliance or customer questionnaire" },
      { value: "identity_access", label: "Authentication, roles, or tenant isolation" },
      { value: "maintainability", label: "Maintainability and team handoff" },
      { value: "infrastructure", label: "Infrastructure and deployment" },
      { value: "data_migration", label: "Data migration" },
      { value: "other", label: "Other" },
    ],
    startWindows: [
      { value: "asap", label: "As soon as possible" },
      { value: "within_30_days", label: "Within 30 days" },
      { value: "within_60_days", label: "Within 60 days" },
      { value: "this_quarter", label: "This quarter" },
      { value: "later", label: "Exploring for later" },
    ],
    budgets: [
      { value: "under_25k", label: "Audit only / under $25K" },
      { value: "25k_75k", label: "$25K–$75K" },
      { value: "75k_150k", label: "$75K–$150K" },
      { value: "150k_300k", label: "$150K–$300K" },
      { value: "300k_plus", label: "$300K+" },
      { value: "not_determined", label: "Not determined" },
    ],
    submitLabel: ctas.applyNextOpening,
    continueLabel: "Continue",
    backLabel: "Back",
  },
  success: {
    heading: "You’re on the list.",
    body: "VYGO LLC will review your application against the next available Production Readiness Audit and engineering opening. Submitting does not form a client engagement until a separate agreement is signed. If a customer contract or security review has a hard deadline, or for privacy requests and legal notices, contact hello@vygo.ai. Notices are effective when received.",
    nextLinkLabel: "View what happens next",
    nextHref: "/audit",
  },
  availabilityFallback: {
    label: "CURRENT AVAILABILITY",
    message: "Join the waitlist for current availability",
    cta: ctas.joinWaitlist,
  },
} as const;

export const thankYouContent = {
  heading: "Thank you for applying.",
  body: "VYGO LLC will review your application against the next available Production Readiness Audit and engineering opening. Submitting does not form a client engagement until a separate agreement is signed. If a customer contract or security review has a hard deadline, or for privacy requests and legal notices, contact hello@vygo.ai. Notices are effective when received.",
  cta: { label: "View the Production Readiness Audit", href: "/audit" },
  homeCta: { label: "Back to home", href: "/" },
} as const;
