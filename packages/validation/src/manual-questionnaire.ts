/**
 * Fallback manual questionnaire ("Can't run this?").
 * ~10 plain-language questions that map onto the SAME readiness report schema
 * as the automated diagnostic path.
 */
import type { ReadinessReportV1Partial } from "./report-schema.js";

export const MANUAL_SOURCE = "manual" as const;
export const MANUAL_CONFIDENCE_LABEL = "low" as const;
/** Numeric confidence written into the report schema for manual answers. */
export const MANUAL_CONFIDENCE_VALUE = 0.25 as const;

export type ManualQuestionType = "text" | "single" | "multi";

export type ManualQuestion = {
  id: string;
  /** Report schema field this answer primarily maps to. */
  reportField: keyof ReadinessReportV1Partial | "concerns";
  label: string;
  helper?: string;
  type: ManualQuestionType;
  options?: readonly string[];
  placeholder?: string;
  required?: boolean;
};

/**
 * Approximately 10 plain-language questions covering the core report fields.
 * Order is UX-facing (product → stack → ops → risk).
 */
export const MANUAL_QUESTIONNAIRE: readonly ManualQuestion[] = [
  {
    id: "summary",
    reportField: "summary",
    label: "What does your product do?",
    helper: "One or two plain sentences.",
    type: "text",
    placeholder: "e.g. Scheduling tool for multi-location clinics",
    required: true,
  },
  {
    id: "languages",
    reportField: "languages",
    label: "Main languages or frameworks?",
    helper: "Whatever you actually ship with.",
    type: "text",
    placeholder: "e.g. TypeScript, Python, React",
    required: true,
  },
  {
    id: "size",
    reportField: "size",
    label: "Roughly how big is the codebase?",
    type: "single",
    options: ["Small (solo / MVP)", "Medium (small team)", "Large (many services or modules)", "Not sure"],
    required: true,
  },
  {
    id: "frontend",
    reportField: "frontend",
    label: "What powers the frontend?",
    type: "text",
    placeholder: "e.g. Next.js, Vue, mobile app, none",
    required: true,
  },
  {
    id: "backend",
    reportField: "backend",
    label: "What powers the backend / API?",
    type: "text",
    placeholder: "e.g. Node/Fastify, Django, serverless functions",
    required: true,
  },
  {
    id: "database",
    reportField: "database",
    label: "Where does data live?",
    type: "text",
    placeholder: "e.g. Postgres, Supabase, Firebase, spreadsheets",
    required: true,
  },
  {
    id: "auth",
    reportField: "auth",
    label: "How do users sign in?",
    type: "text",
    placeholder: "e.g. email magic link, Auth0, Clerk, none yet",
    required: true,
  },
  {
    id: "tenancy",
    reportField: "tenancy",
    label: "Is it multi-tenant or single-tenant?",
    type: "single",
    options: [
      "Single-tenant (one org per deployment)",
      "Multi-tenant (shared app, many customers)",
      "Not sure / not applicable",
    ],
    required: true,
  },
  {
    id: "deploys",
    reportField: "deploys",
    label: "How do you deploy to production?",
    type: "text",
    placeholder: "e.g. Vercel + Railway, Heroku, manual SSH",
    required: true,
  },
  {
    id: "tests",
    reportField: "tests",
    label: "Do you have automated tests?",
    type: "single",
    options: [
      "Yes — meaningful coverage",
      "A few smoke tests",
      "No automated tests",
      "Not sure",
    ],
    required: true,
  },
  {
    id: "secrets_pattern",
    reportField: "secrets_pattern",
    label: "Where do API keys and secrets live?",
    type: "text",
    placeholder: "e.g. host env vars / vault; never in the repo",
    required: true,
  },
  {
    id: "concerns",
    reportField: "concerns",
    label: "What worries you most about going to production?",
    helper: "Optional — security, reliability, scale, access control…",
    type: "text",
    placeholder: "e.g. Security review is blocking a deal",
    required: false,
  },
] as const;

export type ManualAnswers = Record<string, string | string[]>;

export function emptyManualAnswers(): ManualAnswers {
  const out: ManualAnswers = {};
  for (const q of MANUAL_QUESTIONNAIRE) {
    out[q.id] = q.type === "multi" ? [] : "";
  }
  return out;
}

export function isManualQuestionnaireComplete(answers: ManualAnswers): boolean {
  for (const q of MANUAL_QUESTIONNAIRE) {
    if (!q.required) continue;
    const v = answers[q.id];
    if (Array.isArray(v)) {
      if (v.length === 0) return false;
    } else if (!String(v ?? "").trim()) {
      return false;
    }
  }
  return true;
}

/**
 * Map questionnaire answers onto the shared report schema with
 * source=manual and confidence=low.
 */
export function manualAnswersToReport(answers: ManualAnswers): ReadinessReportV1Partial & {
  source: typeof MANUAL_SOURCE;
  confidence: typeof MANUAL_CONFIDENCE_VALUE;
} {
  const str = (id: string): string => {
    const v = answers[id];
    if (Array.isArray(v)) return v.join("; ");
    return String(v ?? "").trim();
  };

  const fragility: string[] = [];
  const concerns = str("concerns");
  if (concerns) fragility.push(concerns);
  const tests = str("tests");
  if (tests.toLowerCase().includes("no automated")) {
    fragility.push("no_automated_tests");
  }

  return {
    summary: str("summary") || "UNKNOWN",
    languages: str("languages") || "UNKNOWN",
    size: str("size") || "UNKNOWN",
    frontend: str("frontend") || "UNKNOWN",
    backend: str("backend") || "UNKNOWN",
    database: str("database") || "UNKNOWN",
    auth: str("auth") || "UNKNOWN",
    tenancy: str("tenancy") || "UNKNOWN",
    deploys: str("deploys") || "UNKNOWN",
    tests: tests || "UNKNOWN",
    secrets_pattern: str("secrets_pattern") || "UNKNOWN",
    fragility_flags: fragility.length > 0 ? fragility : "UNKNOWN",
    structure: "UNKNOWN",
    authorization: "UNKNOWN",
    row_level_security: "UNKNOWN",
    environments: "UNKNOWN",
    background_jobs: "UNKNOWN",
    integrations: "UNKNOWN",
    logging: "UNKNOWN",
    error_handling: "UNKNOWN",
    pii_categories: "UNKNOWN",
    api_surface: "UNKNOWN",
    confidence: MANUAL_CONFIDENCE_VALUE,
    source: MANUAL_SOURCE,
  };
}

/** Session draft payload for a completed manual questionnaire. */
export function buildManualSessionDraft(
  answers: ManualAnswers,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const report = manualAnswersToReport(answers);
  return {
    ...extra,
    source: MANUAL_SOURCE,
    confidence: MANUAL_CONFIDENCE_LABEL,
    manualAnswers: answers,
    report,
    manualSubmittedAt: new Date().toISOString(),
  };
}
