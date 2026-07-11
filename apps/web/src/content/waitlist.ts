import { ctas } from "./ctas";

export const waitlistContent = {
  page: {
    eyebrow: "LIMITED SENIOR-POD CAPACITY",
    headline: "Apply for the next production opening.",
    body: "Tell us what you built, where it is getting stuck, and what deadline matters. We prioritize products with validated demand, active users, sensitive data, or a real commercial opportunity blocked by production risk.",
  },
  form: {
    step1Title: "About you and the product",
    step2Title: "What needs to happen",
    stages: [
      "Working prototype",
      "Private beta",
      "Live with users",
      "Generating revenue",
      "Enterprise deal or rollout in progress",
    ],
    blockers: [
      "Reliability and scale",
      "Security risk",
      "Compliance or customer questionnaire",
      "Authentication, roles, or tenant isolation",
      "Maintainability and team handoff",
      "Infrastructure and deployment",
      "Data migration",
      "Other",
    ],
    startWindows: [
      "As soon as possible",
      "Within 30 days",
      "Within 60 days",
      "This quarter",
      "Exploring for later",
    ],
    budgets: [
      "Audit only / under $25K",
      "$25K–$75K",
      "$75K–$150K",
      "$150K–$300K",
      "$300K+",
      "Not determined",
    ],
    submitLabel: ctas.applyNextOpening,
    continueLabel: "Continue",
    backLabel: "Back",
  },
  success: {
    heading: "You’re on the list.",
    body: "Your application will be reviewed against the next available audit and engineering opening. If a customer contract or security review has a hard deadline, email hello@vygo.ai with the details.",
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
  body: "Your application will be reviewed against the next available Production Readiness Audit and engineering opening. If a customer contract or security review has a hard deadline, email hello@vygo.ai with the details.",
  cta: { label: "View the Production Readiness Audit", href: "/audit" },
  homeCta: { label: "Back to home", href: "/" },
} as const;
