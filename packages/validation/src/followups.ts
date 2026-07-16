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
  const raw: unknown = report.confidence;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  // Labels may still be present if an older partial path stored a string.
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    if (
      /^(very\s+)?high\b|^strong\b|^good\b/.test(s) ||
      (/\bhigh\b/.test(s) && !/\blow\b/.test(s))
    ) {
      return 0.85;
    }
    if (/^(med(ium)?|moderate|mid)\b/.test(s)) return 0.55;
    if (/^(very\s+)?low\b|^weak\b|^poor\b/.test(s) || /\blow\b/.test(s)) return 0.25;
    const n = Number(s);
    if (Number.isFinite(n)) {
      if (n > 1 && n <= 100) return Math.min(1, Math.max(0, n / 100));
      return Math.min(1, Math.max(0, n));
    }
  }
  return null;
}

/**
 * Multi-tenant / enterprise signal for SSO+SAML follow-ups.
 * Must NOT treat "single-tenant" as multi (substring "tenant" was a false positive).
 */
export function isMultiTenantOrEnterpriseSignal(
  tenancy: unknown,
  auth: unknown,
  authorization: unknown,
): boolean {
  const t = textOf(tenancy);
  const authBlob = `${textOf(auth)} ${textOf(authorization)}`;
  const single = /single[-_\s]?tenant|solo(?:\s|$|,)|one[-_\s]?tenant|not\s+multi|no\s+multi/.test(
    t,
  );
  const multi =
    /multi[-_\s]?tenant|\benterprise\b|\bb2b\b|\bworkspaces?\b|\borg[_-]?id\b|\borgs\b/.test(t);
  const ssoAuth = /\bsaml\b|\bsso\b/.test(authBlob);
  const enterpriseAuth = /\benterprise\b/.test(authBlob);
  // Explicit single-tenant without SSO/enterprise auth is not multi-tenant.
  if (single && !ssoAuth && !enterpriseAuth) return false;
  return multi || ssoAuth || enterpriseAuth;
}

function hasAutomatedDeploySignal(deploys: string): boolean {
  return /ci\/?cd|github actions|automated|pipeline/.test(deploys);
}

function hasManualOrOneClickDeploySignal(deploys: string): boolean {
  return /manual|one-?click|click deploy|ssh|console|someone clicks|vercel dashboard|railway dashboard/.test(
    deploys,
  );
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
  const summary = textOf(r.summary);

  // Security questionnaire only when compliance / framework context is present —
  // not merely multi-tenant or "enterprise" marketing copy.
  const mentionsSecurityAsk =
    /soc\s*2|iso\s*27001|hipaa|pci\s*dss|fedramp|compliance|questionnaire|security framework|security questionnaire/.test(
      `${summary} ${textOf(r.error_handling)} ${fragility} ${pii} ${tenancy}`,
    );

  const testsClearlyGated =
    /every deploy|on every deploy|on deploy|required in ci|ci gate|gated on every|gate(d)? on every|tests?\s+gate/.test(
      tests,
    ) ||
    (/ci/.test(tests) && /every|gate|required/.test(tests));
  const testsAmbiguous =
    !tests ||
    tests === "unknown" ||
    /no test|none|manual|not really|ad-?hoc|sometimes|partial/.test(tests) ||
    !testsClearlyGated;

  // Strip common negations so "no payment card or health records" is not a hit.
  const piiForPositive = pii
    .replace(
      /no\s+payment(?:\s+card)?(?:\s+or\s+health(?:\s+records?)?)?(?:\s+in\s+prod(?:uction)?)?/gi,
      " ",
    )
    .replace(/no\s+health(?:\s+records?|pii)?(?:\s+in\s+prod(?:uction)?)?/gi, " ")
    .replace(/neither\s+payment\s+nor\s+health[^,;.]*/gi, " ")
    .replace(/without\s+(?:payment|health|phi|pci)[^,;.]*/gi, " ")
    .replace(/no\s+pii[^,;.]*/gi, " ");
  const hasPaymentOrHealthHint =
    /payment|card|pci|stripe|billing|health|hipaa|phi|medical|patient/.test(piiForPositive) ||
    /payment|health|hipaa|phi/.test(summary);
  // "none" / explicit no-payment-or-health should NOT open the PII follow-up.
  const piiExplicitlyNone =
    /^(none|n\/a|na|no|unknown)$/.test(pii.trim()) ||
    /no payment|no health|neither payment nor health|no payment card or health|no pii/.test(pii);

  const multiTenantOrEnterprise = isMultiTenantOrEnterpriseSignal(tenancy, auth, authorization);

  const automated = hasAutomatedDeploySignal(deploys);
  const manualHint = hasManualOrOneClickDeploySignal(deploys);
  const manualOrOneClickDeploy =
    !deploys || deploys === "unknown" || manualHint || (!automated && !/fully auto/.test(deploys));
  // When deploy text clearly says automated CI/CD (and not also manual), skip who_deploys.
  const whoDeploysTrigger = manualOrOneClickDeploy && !(automated && !manualHint);

  const lowConfidence = conf == null || conf < 0.5;

  return {
    security_questionnaire: mentionsSecurityAsk,
    tests_on_deploy: testsAmbiguous,
    payment_health_pii:
      hasPaymentOrHealthHint || ((!pii || /unknown/.test(pii)) && !piiExplicitlyNone),
    sso_saml: multiTenantOrEnterprise,
    who_deploys: whoDeploysTrigger,
    repo_access: lowConfidence || whoDeploysTrigger,
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
    const reportSaysYes =
      /every deploy|on every|required in ci|ci gate|gated on every|gate(d)? on every/.test(tests) ||
      (/ci/.test(tests) &&
        /every|gate|required/.test(tests) &&
        !/no test|not really|none/.test(tests));
    const reportSaysNo = /no test|none|not really|manual|no automated|ad-?hoc/.test(tests);
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
    if (reportSaysNo && answerSaysYes) {
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
    const reportAutomated =
      hasAutomatedDeploySignal(deploys) && !hasManualOrOneClickDeploySignal(deploys);
    const reportManual =
      hasManualOrOneClickDeploySignal(deploys) && !hasAutomatedDeploySignal(deploys);
    // Mixed phrases like "manual one-click" still count as manual even if no CI keywords.
    const reportManualLoose = hasManualOrOneClickDeploySignal(deploys);
    const answerManual = /manual|one-click|one-?click|ssh|console|agency|engineer clicks/.test(who);
    const answerAuto = /automated ci\/?cd only|automated only|ci\/?cd only/.test(who);
    if (reportAutomated && answerManual) {
      flags.push({
        questionKey: "who_deploys",
        reason: "answer_contradicts_report_deploys",
        reportField: "deploys",
        internal: true,
      });
    }
    if ((reportManual || reportManualLoose) && answerAuto) {
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
      /no payment|no health|none|email, name|no payment card or health|neither/.test(pii) ||
      (!reportHasPayment && !reportHasHealth && pii.length > 0 && pii !== "unknown");
    const answerClaimsPii =
      /^(payment|health|both)/.test(piiAnswer) ||
      (/\b(payment|health|both)\b/.test(piiAnswer) && !/neither|not sure|no\b/.test(piiAnswer));
    const answerNeither = /^neither/.test(piiAnswer) || piiAnswer === "neither";
    if (reportNeither && answerClaimsPii && !answerNeither) {
      flags.push({
        questionKey: "payment_health_pii_prod",
        reason: "answer_contradicts_report_pii",
        reportField: "pii_categories",
        internal: true,
      });
    }
    if ((reportHasPayment || reportHasHealth) && answerNeither) {
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
