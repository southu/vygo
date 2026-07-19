/**
 * Approved CTA vocabulary — use these labels consistently.
 * Avoid generic alternatives like “Book”, “Schedule”, “Get started”, or “Reserve”
 * unless a real booking calendar is added later.
 */
export const ctas = {
  applyNextOpening: "Apply for the next opening",
  joinWaitlist: "Join the waitlist",
  startWithAudit: "Start with the audit",
  seeHowRebuildWorks: "See how the rebuild works",
  reviewSecurityControls: "Review security controls",
  applyNextAuditOpening: "Apply for the next audit opening",
  viewFullMethod: "View the full method",
  reviewEngagementDetails: "Review engagement details",
  reviewSecurityApproach: "Review our security approach",
  takeReadinessCheck: "Take the Readiness Check",
  insightContextual:
    "Have a working product and a production deadline? Apply for the next audit opening.",
} as const;

export type CtaKey = keyof typeof ctas;

export const ctaHrefs = {
  waitlist: "/waitlist",
  apply: "/apply",
  audit: "/audit",
  method: "/method",
  security: "/security",
  pricing: "/pricing",
  // Absolute (not root-relative) so next/link doesn't normalize away the trailing slash.
  readiness: "https://www.vygo.ai/readiness/",
} as const;
