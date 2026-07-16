/**
 * Stage 4 dynamic follow-up questions — data-driven catalog mirrored into
 * readiness_question_bank seed. Runtime prefers DB rows; this module is the
 * source of truth for seeds, triggers, option buckets, and discrepancy rules.
 */
import type { ReadinessReportV1Partial } from "./report-schema.js";

/** Budget buckets required by acceptance criteria (exact labels). */
export const BUDGET_BUCKET_OPTIONS = [
  "<$25K",
  "$25–75K",
  "$75–150K",
  "$150K+",
  "no idea yet",
] as const;

export type BudgetBucket = (typeof BUDGET_BUCKET_OPTIONS)[number];

export type FollowupQuestionType = "range" | "text" | "single" | "multi";

export type FollowupTrigger =
  | { kind: "always" }
  | { kind: "security_questionnaire" }
  | { kind: "tests_on_deploy" }
  | { kind: "payment_health_pii" }
  | { kind: "sso_saml" }
  | { kind: "who_deploys" }
  | { kind: "repo_access" };

export type FollowupQuestionDef = {
  questionKey: string;
  prompt: string;
  category: string;
  sortOrder: number;
  type: FollowupQuestionType;
  options?: readonly string[];
  /** Trigger family; always questions always appear. */
  trigger: FollowupTrigger["kind"];
  /** Optional free-text helper shown in UI. */
  helper?: string;
};

/**
 * Canonical Stage 4 question bank seed.
 * Always-ask first, then conditionals. Never hardcode prompts in route handlers
 * beyond loading these rows (or their DB-seeded copies).
 */
export const FOLLOWUP_QUESTION_SEED: readonly FollowupQuestionDef[] = [
  {
    questionKey: "users_today",
    prompt: "How many users do you have today?",
    category: "followup",
    sortOrder: 200,
    type: "range",
    options: ["0–10", "11–100", "101–1,000", "1,001–10,000", "10,000+", "not sure"],
    trigger: "always",
    helper: "Pick the closest range.",
  },
  {
    questionKey: "users_12_months",
    prompt: "How many users do you expect in 12 months?",
    category: "followup",
    sortOrder: 210,
    type: "range",
    options: ["0–10", "11–100", "101–1,000", "1,001–10,000", "10,000+", "not sure"],
    trigger: "always",
    helper: "Pick the closest range.",
  },
  {
    questionKey: "done_looks_like",
    prompt: "What does “done” look like for this engagement?",
    category: "followup",
    sortOrder: 220,
    type: "text",
    trigger: "always",
    helper: "One or two short sentences.",
  },
  {
    questionKey: "budget",
    prompt: "What budget range are you considering?",
    category: "followup",
    sortOrder: 230,
    type: "single",
    options: BUDGET_BUCKET_OPTIONS,
    trigger: "always",
  },
  {
    questionKey: "security_framework",
    prompt: "Which security / compliance questionnaire framework do you need to pass?",
    category: "followup_conditional",
    sortOrder: 300,
    type: "multi",
    options: ["SOC 2", "ISO 27001", "HIPAA", "PCI DSS", "FedRAMP", "Other / not sure"],
    trigger: "security_questionnaire",
  },
  {
    questionKey: "tests_on_every_deploy",
    prompt: "Do automated tests run on every deploy today?",
    category: "followup_conditional",
    sortOrder: 310,
    type: "single",
    options: ["Yes, required in CI", "Sometimes", "No", "Not sure"],
    trigger: "tests_on_deploy",
  },
  {
    questionKey: "payment_health_pii_prod",
    prompt: "Do you process payment data or health PII in production?",
    category: "followup_conditional",
    sortOrder: 320,
    type: "single",
    options: ["Payment data", "Health PII", "Both", "Neither", "Not sure"],
    trigger: "payment_health_pii",
  },
  {
    questionKey: "sso_saml",
    prompt: "Do enterprise customers require SSO / SAML?",
    category: "followup_conditional",
    sortOrder: 330,
    type: "single",
    options: ["Required now", "Required soon", "Nice to have", "No", "Not sure"],
    trigger: "sso_saml",
  },
  {
    questionKey: "who_deploys",
    prompt: "Who deploys to production today?",
    category: "followup_conditional",
    sortOrder: 340,
    type: "single",
    options: [
      "Automated CI/CD only",
      "Engineer clicks one-click deploy",
      "Manual / SSH / console",
      "Agency / contractor",
      "Not sure",
    ],
    trigger: "who_deploys",
  },
  {
    questionKey: "repo_access_audit",
    prompt: "Can Vygo get temporary read-only repo access for the audit?",
    category: "followup_conditional",
    sortOrder: 350,
    type: "single",
    options: ["Yes", "Maybe — need approval", "No", "Not sure"],
    trigger: "repo_access",
  },
] as const;

function textOf(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(String).join(" ").toLowerCase();
  return String(value).toLowerCase();
}

function confidenceOf(report: ReadinessReportV1Partial): number | null {
  if (typeof report.confidence === "number" && Number.isFinite(report.confidence)) {
    return report.confidence;
  }
  return null;
}

/**
 * Evaluate which trigger families fire for a parsed report.
 * Conditionals appear only when their trigger returns true.
 */
export function evaluateFollowupTriggers(
  report: ReadinessReportV1Partial | null | undefined,
): Record<Exclude<FollowupTrigger["kind"], "always">, boolean> {
  const r = report ?? {};
  const tests = textOf(r.tests);
  const deploys = textOf(r.deploys);
  const pii = textOf(r.pii_categories);
  const tenancy = textOf(r.tenancy);
  const auth = textOf(r.auth);
  const authorization = textOf(r.authorization);
  const fragility = textOf(r.fragility_flags);
  const conf = confidenceOf(r);

  const mentionsSecurityAsk =
    /soc\s*2|iso\s*27001|hipaa|compliance|questionnaire|audit/.test(
      `${textOf(r.summary)} ${textOf(r.error_handling)} ${fragility} ${pii}`,
    ) || /enterprise|b2b/.test(textOf(r.summary));

  const testsAmbiguous =
    !tests ||
    tests === "unknown" ||
    /no test|none|manual|not really|ad-?hoc|sometimes|partial/.test(tests) ||
    !/every deploy|on deploy|ci|required|gate/.test(tests);

  const hasPaymentOrHealthHint =
    /payment|card|pci|stripe|billing|health|hipaa|phi|medical|patient/.test(pii) ||
    /payment|health|hipaa|phi/.test(textOf(r.summary));

  const multiTenantOrEnterprise =
    /multi|org|tenant|enterprise|b2b|workspace/.test(tenancy) ||
    /saml|sso|enterprise/.test(`${auth} ${authorization}`);

  const manualOrOneClickDeploy =
    !deploys ||
    deploys === "unknown" ||
    /manual|one-?click|click deploy|ssh|console|someone clicks|vercel dashboard|railway dashboard/.test(
      deploys,
    ) ||
    !/ci\/?cd|github actions|automated|pipeline/.test(deploys);

  const lowConfidence = conf == null || conf < 0.5 || /low/.test(textOf(r.confidence));

  return {
    security_questionnaire: mentionsSecurityAsk || multiTenantOrEnterprise,
    tests_on_deploy: testsAmbiguous,
    payment_health_pii: hasPaymentOrHealthHint || /unknown/.test(pii) || !pii,
    sso_saml: multiTenantOrEnterprise,
    who_deploys: manualOrOneClickDeploy,
    repo_access: lowConfidence || manualOrOneClickDeploy,
  };
}

export type PublicFollowupQuestion = {
  questionKey: string;
  prompt: string;
  category: string;
  sortOrder: number;
  type: FollowupQuestionType;
  options?: string[];
  helper?: string;
  required: boolean;
  /** Trigger that caused inclusion — never a secret. */
  trigger: FollowupTrigger["kind"];
};

/**
 * Select follow-up questions for a report. Prefers DB-shaped rows when provided;
 * falls back to the in-module seed (same data as migration).
 */
export function selectFollowupQuestions(
  report: ReadinessReportV1Partial | null | undefined,
  bankRows?: Array<{
    questionKey: string;
    prompt: string;
    category: string;
    sortOrder: number;
    active?: boolean;
    metadata?: Record<string, unknown> | null;
  }>,
): PublicFollowupQuestion[] {
  const triggers = evaluateFollowupTriggers(report);
  const defs: FollowupQuestionDef[] = bankRows?.length
    ? bankRows
        .filter((row) => row.active !== false)
        .map((row) => {
          const meta = row.metadata ?? {};
          const seed = FOLLOWUP_QUESTION_SEED.find((s) => s.questionKey === row.questionKey);
          const trigger =
            (typeof meta.trigger === "string" && meta.trigger) || seed?.trigger || "always";
          const type = (typeof meta.type === "string" && meta.type) || seed?.type || "text";
          const options = Array.isArray(meta.options)
            ? (meta.options as string[])
            : seed?.options
              ? [...seed.options]
              : undefined;
          return {
            questionKey: row.questionKey,
            prompt: row.prompt,
            category: row.category,
            sortOrder: row.sortOrder,
            type: type as FollowupQuestionType,
            options,
            trigger: trigger as FollowupTrigger["kind"],
            helper: typeof meta.helper === "string" ? meta.helper : seed?.helper,
          };
        })
    : [...FOLLOWUP_QUESTION_SEED];

  // Only Stage 4 follow-up keys (seed + any DB rows in followup categories).
  const followupKeys = new Set(FOLLOWUP_QUESTION_SEED.map((q) => q.questionKey));
  const selected = defs
    .filter((q) => followupKeys.has(q.questionKey) || q.category.startsWith("followup"))
    .filter((q) => {
      if (q.trigger === "always") return true;
      return Boolean(triggers[q.trigger as keyof typeof triggers]);
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((q) => ({
      questionKey: q.questionKey,
      prompt: q.prompt,
      category: q.category,
      sortOrder: q.sortOrder,
      type: q.type,
      options: q.options ? [...q.options] : undefined,
      helper: q.helper,
      required: q.trigger === "always",
      trigger: q.trigger,
    }));

  return selected;
}

export type DiscrepancyFlag = {
  questionKey: string;
  reason: string;
  reportField?: string;
  /** Internal only — never render in user-facing UI. */
  internal: true;
};

/**
 * Compare follow-up answers against the parsed report and return internal
 * discrepancy flags. Never include user-visible copy that mentions "discrepancy".
 */
export function detectFollowupDiscrepancies(
  report: ReadinessReportV1Partial | null | undefined,
  answers: Record<string, unknown>,
): DiscrepancyFlag[] {
  const flags: DiscrepancyFlag[] = [];
  const r = report ?? {};
  const tests = textOf(r.tests);
  const deploys = textOf(r.deploys);
  const pii = textOf(r.pii_categories);
  const tenancy = textOf(r.tenancy);

  const testsAnswer = textOf(answers.tests_on_every_deploy);
  if (testsAnswer) {
    const reportSaysYes = /every deploy|on every|required in ci|ci gate/.test(tests);
    const answerSaysNo = /^(no|sometimes|not sure)/.test(testsAnswer);
    const answerSaysYes = /^yes/.test(testsAnswer);
    if (reportSaysYes && answerSaysNo) {
      flags.push({
        questionKey: "tests_on_every_deploy",
        reason: "answer_contradicts_report_tests",
        reportField: "tests",
        internal: true,
      });
    }
    if (!reportSaysYes && /no test|none|not really|manual/.test(tests) && answerSaysYes) {
      flags.push({
        questionKey: "tests_on_every_deploy",
        reason: "answer_contradicts_report_tests",
        reportField: "tests",
        internal: true,
      });
    }
  }

  const who = textOf(answers.who_deploys);
  if (who) {
    const reportAutomated = /ci\/?cd|github actions|automated|pipeline/.test(deploys);
    const answerManual = /manual|one-click|ssh|console|agency|engineer clicks/.test(who);
    const answerAuto = /automated ci\/?cd only/.test(who);
    if (reportAutomated && answerManual) {
      flags.push({
        questionKey: "who_deploys",
        reason: "answer_contradicts_report_deploys",
        reportField: "deploys",
        internal: true,
      });
    }
    if (!reportAutomated && /manual|one-?click|click/.test(deploys) && answerAuto) {
      flags.push({
        questionKey: "who_deploys",
        reason: "answer_contradicts_report_deploys",
        reportField: "deploys",
        internal: true,
      });
    }
  }

  const piiAnswer = textOf(answers.payment_health_pii_prod);
  if (piiAnswer) {
    const reportHasPayment = /payment|card|pci|stripe|billing/.test(pii);
    const reportHasHealth = /health|hipaa|phi|medical|patient/.test(pii);
    const reportNeither =
      /no payment|no health|none|email, name|no payment card or health/.test(pii) ||
      (!reportHasPayment && !reportHasHealth && pii.length > 0 && pii !== "unknown");
    if (reportNeither && /payment|health|both/.test(piiAnswer) && !/neither/.test(piiAnswer)) {
      flags.push({
        questionKey: "payment_health_pii_prod",
        reason: "answer_contradicts_report_pii",
        reportField: "pii_categories",
        internal: true,
      });
    }
    if ((reportHasPayment || reportHasHealth) && /^neither/.test(piiAnswer)) {
      flags.push({
        questionKey: "payment_health_pii_prod",
        reason: "answer_contradicts_report_pii",
        reportField: "pii_categories",
        internal: true,
      });
    }
  }

  const sso = textOf(answers.sso_saml);
  if (sso && /single|no multi|solo/.test(tenancy) && /required/.test(sso)) {
    flags.push({
      questionKey: "sso_saml",
      reason: "answer_contradicts_report_tenancy",
      reportField: "tenancy",
      internal: true,
    });
  }

  return flags;
}

/** Metadata blob stored on readiness_question_bank.metadata for each seed row. */
export function followupSeedMetadata(def: FollowupQuestionDef): Record<string, unknown> {
  return {
    stage: 4,
    type: def.type,
    trigger: def.trigger,
    options: def.options ? [...def.options] : undefined,
    helper: def.helper,
  };
}
