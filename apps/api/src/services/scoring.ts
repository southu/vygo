import type { WaitlistRequest } from "@vygo/validation";

/**
 * Configurable deterministic lead scoring weights (internal only — never public).
 * Keep in sync with docs/api.md and the build specification.
 */
export const LEAD_SCORE_WEIGHTS = {
  stage: {
    prototype: 0,
    private_beta: 1,
    live_users: 2,
    revenue: 3,
    enterprise_pipeline: 4,
  },
  commercialDeadline: 3,
  desiredStartSoon: 2, // asap | within_30_days
  budget75kPlus: 2,
  securityComplianceBlocker: 2,
} as const;

export type LeadScoreBreakdown = {
  total: number;
  components: Record<string, number>;
};

export function computeLeadScore(application: WaitlistRequest): LeadScoreBreakdown {
  const components: Record<string, number> = {};

  const stageScore = LEAD_SCORE_WEIGHTS.stage[application.stage] ?? 0;
  components.stage = stageScore;

  if (application.commercialDeadline) {
    components.commercialDeadline = LEAD_SCORE_WEIGHTS.commercialDeadline;
  }

  if (
    application.desiredStartWindow === "asap" ||
    application.desiredStartWindow === "within_30_days"
  ) {
    components.desiredStartSoon = LEAD_SCORE_WEIGHTS.desiredStartSoon;
  }

  const budget = application.budgetRange;
  if (budget === "75k_150k" || budget === "150k_300k" || budget === "300k_plus") {
    components.budget75kPlus = LEAD_SCORE_WEIGHTS.budget75kPlus;
  }

  if (
    application.primaryBlocker === "security_compliance" ||
    application.primaryBlocker === "security"
  ) {
    components.securityComplianceBlocker = LEAD_SCORE_WEIGHTS.securityComplianceBlocker;
  }

  const total = Object.values(components).reduce((a, b) => a + b, 0);
  return { total, components };
}
