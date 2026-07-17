/**
 * Deployment-safe readiness score dry-run (edge + shared helpers).
 *
 * Pure compute over the same engine as POST /v1/readiness/score — no Turnstile,
 * no lead creation, no email, no PII persistence. Used by automated callers
 * on www.vygo.ai to observe answer-driven dimension scores.
 */
/**
 * Uses relative monorepo imports (not the edge runtime package graph) so unit
 * tests under api/_lib can exercise the same engine as Railway without
 * bundling @vygo/validation into the Vercel Hobby function.
 */
import {
  computeReadinessScore,
  type DimensionScoreResult,
  type ReadinessScorePayload,
} from "../../packages/validation/src/readiness-scoring.js";
import {
  manualAnswersToReport,
  type ManualAnswers,
} from "../../packages/validation/src/manual-questionnaire.js";

/** Built-in weak posture (materially low scores across dimensions). */
export const SCORE_PREVIEW_PROFILE_WEAK: Record<string, unknown> = {
  summary: "risky prototype with shared passwords and no tests",
  languages: "unknown mixed undocumented",
  size: "huge unknown",
  structure: "spaghetti god module",
  frontend: "unknown",
  backend: "unknown",
  database: "sqlite file on laptop",
  tenancy: "shared without isolation",
  auth: "none — shared password only",
  authorization: "all admin",
  row_level_security: "none",
  environments: "prod only",
  deploys: "manual ssh",
  tests: "none",
  background_jobs: "fire and forget",
  integrations: "unknown",
  secrets_pattern: "hardcoded in git",
  logging: "console only",
  error_handling: "unhandled stack traces",
  pii_categories: "payment cards and health records",
  api_surface: "public unauthenticated open",
  fragility_flags: ["single region", "no backup", "manual migrate"],
  confidence: 0.35,
};

/** Built-in strong posture (materially high scores across dimensions). */
export const SCORE_PREVIEW_PROFILE_STRONG: Record<string, unknown> = {
  summary: "Internal ops tool for inventory approvals with solid production hygiene",
  languages: "TypeScript",
  size: "small",
  structure: "modular monorepo packages",
  frontend: "Next.js",
  backend: "Fastify",
  database: "Postgres",
  tenancy: "single-tenant internal",
  auth: "session cookies + magic link",
  authorization: "RBAC roles owner admin member",
  row_level_security: "enforced via app middleware",
  environments: "local staging production",
  deploys: "GitHub Actions CI/CD automated pipeline with rollback",
  tests: "unit integration e2e gate on every deploy via CI",
  background_jobs: "email outbox worker with retry",
  integrations: "Slack",
  secrets_pattern: "Railway env + Vault references",
  logging: "structured JSON logs request ids",
  error_handling: "safe public errors with graceful retry",
  pii_categories: "email, name; no payment card or health records in prod",
  api_surface: "HTTPS /v1 versioned API with auth",
  fragility_flags: ["single_region"],
  confidence: 0.85,
};

export const SCORE_PREVIEW_PROFILES = {
  weak: SCORE_PREVIEW_PROFILE_WEAK,
  strong: SCORE_PREVIEW_PROFILE_STRONG,
  low: SCORE_PREVIEW_PROFILE_WEAK,
  high: SCORE_PREVIEW_PROFILE_STRONG,
} as const;

export type ScorePreviewProfileName = keyof typeof SCORE_PREVIEW_PROFILES;

export type ScorePreviewInput = {
  report?: Record<string, unknown> | null;
  answers?: Record<string, unknown> | null;
  manualAnswers?: Record<string, unknown> | null;
  source?: string | null;
  stage1?: Record<string, unknown> | null;
  followups?: Record<string, unknown> | null;
  /** Named built-in profile when no report/answers provided. */
  profile?: string | null;
};

export type ScorePreviewResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; code: string; message: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolveReport(input: ScorePreviewInput): {
  report: Record<string, unknown>;
  source: "paste" | "manual";
  profile: string | null;
} | null {
  const profileRaw =
    typeof input.profile === "string" ? input.profile.trim().toLowerCase() : "";
  if (profileRaw && profileRaw in SCORE_PREVIEW_PROFILES) {
    const key = profileRaw as ScorePreviewProfileName;
    return {
      report: { ...SCORE_PREVIEW_PROFILES[key] },
      source: "paste",
      profile: key === "low" ? "weak" : key === "high" ? "strong" : key,
    };
  }

  if (isPlainObject(input.report) && Object.keys(input.report).length > 0) {
    return {
      report: { ...input.report },
      source: input.source === "manual" ? "manual" : "paste",
      profile: null,
    };
  }

  // `answers` is an alias for a flat report field map (tester-friendly).
  if (isPlainObject(input.answers) && Object.keys(input.answers).length > 0) {
    return {
      report: { ...input.answers },
      source: input.source === "manual" ? "manual" : "paste",
      profile: null,
    };
  }

  if (isPlainObject(input.manualAnswers) && Object.keys(input.manualAnswers).length > 0) {
    const mapped = manualAnswersToReport(input.manualAnswers as ManualAnswers);
    return {
      report: { ...mapped },
      source: "manual",
      profile: null,
    };
  }

  return null;
}

/**
 * Strip contact/PII-shaped keys that must never be accepted or echoed by preview.
 * Scoring only uses report fields; these are defense-in-depth.
 */
function stripContactKeys(report: Record<string, unknown>): Record<string, unknown> {
  const blocked = new Set([
    "email",
    "name",
    "fullName",
    "full_name",
    "phone",
    "company",
    "companyName",
    "turnstileToken",
    "turnstile_token",
    "password",
    "token",
  ]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(report)) {
    if (blocked.has(k)) continue;
    out[k] = v;
  }
  return out;
}

function publicPreviewBody(
  payload: ReadinessScorePayload,
  meta: { profile: string | null; source: string },
): Record<string, unknown> {
  const dimensionResults: DimensionScoreResult[] = payload.dimensionResults;
  return {
    preview: true,
    dryRun: true,
    persisted: false,
    leadCreated: false,
    turnstileRequired: false,
    profile: meta.profile,
    source: payload.source,
    displayMode: payload.displayMode,
    overall: payload.overall,
    bucket: payload.bucket,
    scores: payload.dimensions,
    /** Flat dimension map (legacy consumers). */
    dimensions: payload.dimensions,
    dimensionDetails: payload.dimensionDetails,
    /**
     * Mission-shaped array:
     * [{ dimension, score, sub_metrics: [{ name, score, weight, evidence }] }]
     */
    dimensionResults,
    /** Alias so callers may treat the body as results-first. */
    results: dimensionResults,
    /** Ranked evidence insights grounded in submitted answers. */
    insights: Array.isArray(payload.insights) ? payload.insights : [],
    ranges: payload.ranges ?? null,
    reasoning: payload.reasoning,
    caveat: payload.caveat ?? null,
    findings: payload.findings,
    recommendedEngagement: payload.recommendedEngagement,
    offerKey: payload.offerKey,
    ctaLabel: payload.ctaLabel,
    pricing: payload.pricing,
    configKey: payload.configKey,
    configVersion: payload.configVersion,
  };
}

/**
 * Run dry-run scoring. Fail closed with a clear validation error when the
 * caller provides neither answers nor a known profile (no silent defaults).
 */
export function runScorePreview(input: ScorePreviewInput): ScorePreviewResult {
  const resolved = resolveReport(input);
  if (!resolved) {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION_ERROR",
      message:
        "Provide assessment answers as `report` or `answers`, or a built-in `profile` of \"weak\" or \"strong\".",
    };
  }

  const report = stripContactKeys(resolved.report);
  if (Object.keys(report).length === 0) {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Assessment answers must include at least one scored field.",
    };
  }

  try {
    const payload = computeReadinessScore({
      report,
      source: resolved.source,
      stage1: isPlainObject(input.stage1) ? input.stage1 : null,
      followups: isPlainObject(input.followups) ? input.followups : null,
      config: null,
    });
    return {
      ok: true,
      body: publicPreviewBody(payload, {
        profile: resolved.profile,
        source: resolved.source,
      }),
    };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      code: "SCORING_UNAVAILABLE",
      message:
        error instanceof Error
          ? `Scoring engine failed closed: ${error.message.slice(0, 160)}`
          : "Scoring engine failed closed.",
    };
  }
}

/** Score both built-in profiles (for static /api/readiness sampleAssessments). */
export function scoreBuiltInProfiles(): {
  weak: Record<string, unknown>;
  strong: Record<string, unknown>;
} {
  const weak = runScorePreview({ profile: "weak" });
  const strong = runScorePreview({ profile: "strong" });
  if (!weak.ok || !strong.ok) {
    throw new Error("Built-in score profiles failed to compute");
  }
  return {
    weak: {
      profile: "weak",
      label: "Materially weak answers",
      overall: weak.body.overall,
      dimensions: weak.body.dimensions,
      dimensionResults: weak.body.dimensionResults,
    },
    strong: {
      profile: "strong",
      label: "Materially strong answers",
      overall: strong.body.overall,
      dimensions: strong.body.dimensions,
      dimensionResults: strong.body.dimensionResults,
    },
  };
}
