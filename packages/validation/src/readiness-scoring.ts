/**
 * Stage 5 readiness scoring + deterministic engagement bucketing.
 *
 * Dimension weights and field contributions come from readiness_scoring_config
 * seed data (DEFAULT_SCORING_CONFIG). Application code never hardcodes magic
 * weight numbers for scoring — it reads them from the config object.
 *
 * UNKNOWN / unanswered fields score as risk (~25th percentile), never midpoint.
 * Manual-source submissions get score RANGES rather than point scores.
 *
 * Bucketing is top-down, first match wins:
 *   1) Not a fit
 *   2) Enterprise
 *   3) Scale
 *   4) Launch
 *   5) Harden
 * unresolved → Launch + talk-to-us caveat
 *
 * Top findings are HEADLINES ONLY — no how-to-fix or remediation detail.
 */

import type { ReadinessReportV1Partial } from "./report-schema.js";
import type { ReadinessStage1Answers } from "./readiness-intake.js";
import {
  buildEvidenceInsights,
  type EvidenceInsight,
} from "./evidence-insights.js";
import {
  buildDetailedAnalysis,
  type DetailedRecommendation,
  type DimensionAnalysis,
} from "./detailed-analysis.js";

/** Canonical dimension labels (API + UI). */
export const READINESS_DIMENSIONS = [
  "Security",
  "Reliability",
  "Operability",
  "Maintainability",
  "Compliance posture",
] as const;

export type ReadinessDimension = (typeof READINESS_DIMENSIONS)[number];

export type DimensionScores = Record<ReadinessDimension, number>;

export type DimensionRanges = Record<
  ReadinessDimension,
  { low: number; high: number; mid: number }
>;

export type EngagementBucket = "Not a fit" | "Enterprise" | "Scale" | "Launch" | "Harden";

export type ScoringSource = "paste" | "manual" | "unknown";

/** Status band for a single sub-metric check. */
export type SubMetricStatus = "strong" | "adequate" | "at_risk" | "unknown";

/**
 * Evidence record for a sub-metric: which question drove the score, the
 * prospect's actual answer, and a one-line plain-English reason.
 */
export type SubMetricEvidence = {
  /** Assessment / report field id that contributed (e.g. "auth", "tests"). */
  question_id: string;
  /** Prospect's actual answer value that produced the score. */
  answer_value: unknown;
  /** One-line plain-English reason referencing the substance of the answer. */
  reason: string;
};

/** One scored check (sub-metric) inside a dimension, e.g. Security → auth. */
export type SubMetricScore = {
  /** Report field key the check evaluates, e.g. "auth". */
  key: string;
  /** Human-readable label, e.g. "Authentication". */
  label: string;
  /** Alias of label for mission-shaped consumers (`sub_metrics[].name`). */
  name: string;
  /** 0–100 check score (same math that feeds the dimension aggregate). */
  score: number;
  /** Contribution weight within the dimension. */
  weight: number;
  /** Whether the underlying report field was answered (vs unknown/blank). */
  answered: boolean;
  status: SubMetricStatus;
  /** Fully populated evidence for this sub-score. */
  evidence: SubMetricEvidence;
};

/**
 * Mission-shaped sub-metric entry consumed by UI layers:
 * { name, score, weight, evidence: { question_id, answer_value, reason } }
 */
export type SubMetricResult = {
  name: string;
  score: number;
  weight: number;
  evidence: SubMetricEvidence;
};

/**
 * Mission-shaped dimension result:
 * { dimension, score, sub_metrics: [...] }
 */
export type DimensionScoreResult = {
  dimension: string;
  score: number;
  sub_metrics: SubMetricResult[];
};

/** Nested per-dimension breakdown: aggregate score + its sub-metric checks. */
export type DimensionDetail = {
  label: ReadinessDimension;
  /** Aggregate 0–100 dimension score (weighted mean of checks). */
  score: number;
  /** Dimension-level weight used in the overall blend. */
  weight: number;
  checks: SubMetricScore[];
  /** Mission-shaped sub_metrics array (same checks, evidence-first shape). */
  sub_metrics: SubMetricResult[];
};

export type DimensionDetails = Record<ReadinessDimension, DimensionDetail>;

/** Public snapshot scores payload persisted on readiness_submissions.scores. */
export type ReadinessScorePayload = {
  version: number;
  source: ScoringSource;
  displayMode: "point" | "range";
  dimensions: DimensionScores;
  /** Detailed nested sub-metrics (checks) for every dimension. */
  dimensionDetails: DimensionDetails;
  /**
   * Canonical array of dimension results for UI / tester consumers:
   * [{ dimension, score, sub_metrics: [{ name, score, weight, evidence }] }]
   */
  dimensionResults: DimensionScoreResult[];
  /**
   * Ranked evidence insights extracted from the prospect's own answers
   * (tools, counts, security practices, team signals). Additive; does not
   * alter dimension scores or existing findings shape.
   */
  insights: EvidenceInsight[];
  /**
   * Per-dimension multi-paragraph written analysis grounded in sub-metric
   * evidence and insights. Additive; does not alter scores.
   */
  dimensionAnalyses: DimensionAnalysis[];
  /**
   * Pattern-branched detailed engagement recommendation (tier, rationale with
   * ≥3 cited findings, expected outcomes, first-step scope).
   */
  recommendation: DetailedRecommendation;
  ranges?: DimensionRanges;
  overall: number;
  bucket: EngagementBucket;
  reasoning: string;
  /** Talk-to-us caveat when default Launch fallback applied. */
  caveat?: string;
  findings: string[];
  recommendedEngagement: string;
  offerKey: "harden" | "audit" | "build" | "general";
  ctaLabel: string;
  pricing: {
    harden: string;
    launch: string;
    scale: string;
    enterprise: string;
    auditNote: string;
  };
  configKey: string;
  configVersion: number;
};

export type FieldScoreRule = {
  field: string;
  /** Contribution weight within the dimension (from seed config). */
  weight: number;
  /** Patterns that score high (good posture). */
  good?: string[];
  /** Patterns that score low (risk). */
  bad?: string[];
};

export type DimensionConfig = {
  label: ReadinessDimension;
  /** Dimension-level weight for overall blend (from seed). */
  weight: number;
  fields: FieldScoreRule[];
};

/**
 * Seed scoring config — mirrored into readiness_scoring_config.rules/weights.
 * Scoring code MUST read from a config object shaped like this (DB row or default).
 */
export type ReadinessScoringConfig = {
  configKey: string;
  version: number;
  /** Approximate percentile used when a field is unknown/unanswered (risk, not neutral). */
  unknownPercentile: number;
  /** Half-width of display range for manual-source scores (points). */
  manualRangeHalfWidth: number;
  dimensions: DimensionConfig[];
  pricing: {
    harden: string;
    launch: string;
    scale: string;
    enterprise: string;
    auditNote: string;
  };
};

/** Default seed — also written by migration 0007 / ensureReadinessTables. */
export const DEFAULT_SCORING_CONFIG: ReadinessScoringConfig = {
  configKey: "default",
  version: 2,
  unknownPercentile: 0.25,
  manualRangeHalfWidth: 15,
  dimensions: [
    {
      label: "Security",
      weight: 1.2,
      fields: [
        {
          field: "auth",
          weight: 1.5,
          good: ["oauth", "oidc", "saml", "sso", "session", "mfa", "magic link", "clerk", "auth0"],
          bad: ["none", "no auth", "shared password", "hardcoded", "basic auth only"],
        },
        {
          field: "authorization",
          weight: 1.5,
          good: ["rbac", "roles", "policy", "permission", "scoped"],
          bad: ["none", "no authz", "all admin", "shared"],
        },
        {
          field: "row_level_security",
          weight: 1.2,
          good: ["rls", "enforced", "row-level", "tenant isolation", "org_id"],
          bad: ["none", "planned", "not", "missing"],
        },
        {
          field: "secrets_pattern",
          weight: 1.3,
          good: ["vault", "secret manager", "env injection", "rotated", "railway env"],
          bad: ["git", "hardcoded", "plain text", "committed", "none"],
        },
        {
          field: "api_surface",
          weight: 0.8,
          good: ["https", "auth", "rate limit", "versioned"],
          bad: ["public unauthenticated", "no auth", "open"],
        },
      ],
    },
    {
      label: "Reliability",
      weight: 1.1,
      fields: [
        {
          field: "tests",
          weight: 1.5,
          good: ["unit", "integration", "e2e", "ci", "every deploy", "gate", "automated"],
          bad: ["none", "no test", "manual only", "ad-hoc", "never run", "not run"],
        },
        {
          field: "error_handling",
          weight: 1.0,
          good: ["safe", "structured", "retry", "circuit", "graceful"],
          bad: ["none", "swallow", "stack trace to client", "unhandled"],
        },
        {
          field: "background_jobs",
          weight: 0.8,
          good: ["queue", "worker", "outbox", "retry", "idempotent"],
          bad: ["none", "fire and forget", "cron only", "manual"],
        },
        {
          field: "fragility_flags",
          weight: 1.2,
          good: ["none", "low", "mitigated"],
          bad: ["single", "manual", "spof", "fragile", "no backup", "risk"],
        },
        {
          field: "logging",
          weight: 0.7,
          good: ["structured", "request id", "central", "json"],
          bad: ["console only", "none", "print", "missing"],
        },
      ],
    },
    {
      label: "Operability",
      weight: 1.0,
      fields: [
        {
          field: "deploys",
          weight: 1.4,
          good: ["ci/cd", "github actions", "automated", "pipeline", "rollback"],
          bad: ["manual", "ssh", "one-click", "someone clicks", "dashboard only"],
        },
        {
          field: "environments",
          weight: 1.0,
          good: ["staging", "production", "preview", "local"],
          bad: ["prod only", "none", "single", "localhost only"],
        },
        {
          field: "logging",
          weight: 0.9,
          good: ["structured", "metrics", "tracing", "observability", "monitor"],
          bad: ["none", "printf", "missing"],
        },
        {
          field: "error_handling",
          weight: 0.7,
          good: ["alerting", "oncall", "pager", "slo"],
          bad: ["none", "hope"],
        },
        {
          field: "background_jobs",
          weight: 0.6,
          good: ["monitored", "dead letter", "visibility"],
          bad: ["opaque", "none"],
        },
      ],
    },
    {
      label: "Maintainability",
      weight: 0.9,
      fields: [
        {
          field: "structure",
          weight: 1.2,
          good: ["monorepo", "packages", "modular", "services", "clear boundaries"],
          bad: ["spaghetti", "god module", "unclear", "legacy dump"],
        },
        {
          field: "languages",
          weight: 0.7,
          good: ["typescript", "python", "go", "rust", "java"],
          bad: ["unknown", "mixed undocumented"],
        },
        {
          field: "size",
          weight: 0.6,
          good: ["small", "medium", "documented"],
          bad: ["huge unknown", "unbounded"],
        },
        {
          field: "tests",
          weight: 1.1,
          good: ["unit", "coverage", "regression"],
          bad: ["none", "no test"],
        },
        {
          field: "frontend",
          weight: 0.5,
          good: ["next", "react", "vue", "documented"],
          bad: ["unknown"],
        },
        {
          field: "backend",
          weight: 0.5,
          good: ["fastify", "express", "django", "rails", "documented"],
          bad: ["unknown"],
        },
      ],
    },
    {
      label: "Compliance posture",
      weight: 1.15,
      fields: [
        {
          field: "pii_categories",
          weight: 1.4,
          good: ["none", "email, name", "no payment", "no health", "minimized", "no phi"],
          bad: ["payment", "card", "pci", "hipaa", "phi", "health", "medical", "ssn"],
        },
        {
          field: "tenancy",
          weight: 1.1,
          good: ["single-tenant", "isolated", "rls", "org isolation"],
          bad: ["shared without isolation", "no tenant"],
        },
        {
          field: "auth",
          weight: 1.0,
          good: ["sso", "saml", "mfa", "enterprise idp"],
          bad: ["shared password", "none"],
        },
        {
          field: "authorization",
          weight: 0.9,
          good: ["rbac", "audit", "least privilege"],
          bad: ["all admin", "none"],
        },
        {
          field: "secrets_pattern",
          weight: 0.8,
          good: ["vault", "rotation", "secret manager"],
          bad: ["git", "hardcoded"],
        },
      ],
    },
  ],
  pricing: {
    harden: "Harden $9,500 fixed",
    launch: "Launch from $75K",
    scale: "Scale from $145K",
    enterprise: "Enterprise $275K+",
    auditNote: "The audit locks scope and price and the $15K audit is credited toward the build.",
  },
};

function textOf(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim().toLowerCase();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) return value.map((v) => textOf(v)).join(" ");
  if (typeof value === "object") {
    try {
      return JSON.stringify(value).toLowerCase();
    } catch {
      return "";
    }
  }
  return String(value).trim().toLowerCase();
}

function isUnknownField(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "number") return !Number.isFinite(value);
  if (Array.isArray(value)) return value.length === 0;
  const s = textOf(value);
  if (!s) return true;
  return /^(unknown|n\/a|na|not sure|not yet determined|tbd|—|-)$/i.test(s.trim());
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Score a single field value 0–100 using good/bad keyword signals.
 * Unknown → risk score at unknownPercentile * 100 (≈25).
 */
export function scoreFieldValue(
  value: unknown,
  rule: FieldScoreRule,
  unknownPercentile: number,
): number {
  if (isUnknownField(value)) {
    return clampScore(unknownPercentile * 100);
  }
  const text = textOf(value);
  let goodHits = 0;
  let badHits = 0;
  for (const g of rule.good ?? []) {
    if (g && text.includes(g.toLowerCase())) goodHits += 1;
  }
  for (const b of rule.bad ?? []) {
    if (b && text.includes(b.toLowerCase())) badHits += 1;
  }

  // Base: slightly above risk when present but unrecognised; reward goods, penalize bads.
  let score = 55;
  if (goodHits > 0) score = 62 + Math.min(goodHits, 4) * 8;
  if (badHits > 0) score = Math.min(score, 48 - Math.min(badHits, 3) * 10);
  if (goodHits > 0 && badHits > 0) {
    score = 50 + goodHits * 6 - badHits * 12;
  }

  // Fragility flags: more flags → lower score when bad keywords dominate.
  if (rule.field === "fragility_flags" && Array.isArray(value) && value.length > 2 && badHits > 0) {
    score -= 8;
  }

  return clampScore(score);
}

/** Human-readable labels for sub-metric check keys (report fields). */
export const READINESS_CHECK_LABELS: Record<string, string> = {
  auth: "Authentication",
  authorization: "Authorization & access control",
  row_level_security: "Row-level security / tenant isolation",
  secrets_pattern: "Secrets management",
  api_surface: "API surface hardening",
  tests: "Tests & deploy gates",
  error_handling: "Error handling",
  background_jobs: "Background jobs & queues",
  fragility_flags: "Fragility & single points of failure",
  logging: "Logging & observability",
  deploys: "Deploy pipeline",
  environments: "Environments",
  structure: "Codebase structure",
  languages: "Language stack",
  size: "Codebase size",
  frontend: "Frontend stack",
  backend: "Backend stack",
  pii_categories: "PII & data sensitivity",
  tenancy: "Tenancy model",
};

function checkLabel(field: string): string {
  return READINESS_CHECK_LABELS[field] ?? field.replace(/_/g, " ");
}

function subMetricStatus(score: number, answered: boolean): SubMetricStatus {
  if (!answered) return "unknown";
  if (score >= 70) return "strong";
  if (score >= 55) return "adequate";
  return "at_risk";
}

/**
 * Present an answer value for evidence storage (preserve primitives/arrays).
 * Always returns a present value so evidence.answer_value is never empty/null.
 */
function evidenceAnswerValue(value: unknown): unknown {
  if (value == null) return "unanswered";
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : "unanswered";
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    if (value.length === 0) return "unanswered";
    return value.map((item) => (typeof item === "string" ? item.trim() : item));
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

/** Short display snippet of an answer for reason strings (never empty when answered). */
function answerSnippet(value: unknown, maxLen = 120): string {
  if (value == null) return "unanswered";
  if (typeof value === "string") {
    const t = value.trim().replace(/\s+/g, " ");
    if (!t) return "unanswered";
    return t.length > maxLen ? `${t.slice(0, maxLen - 1)}…` : t;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const joined = value
      .map((v) => (typeof v === "string" ? v.trim() : String(v)))
      .filter(Boolean)
      .join(", ");
    if (!joined) return "unanswered";
    return joined.length > maxLen ? `${joined.slice(0, maxLen - 1)}…` : joined;
  }
  try {
    const s = JSON.stringify(value);
    return s.length > maxLen ? `${s.slice(0, maxLen - 1)}…` : s;
  } catch {
    return "provided answer";
  }
}

/**
 * Build a one-line plain-English reason that references the substance of the
 * prospect's answer (not empty, N/A, or identical boilerplate).
 */
export function buildSubMetricReason(
  rule: FieldScoreRule,
  value: unknown,
  score: number,
  answered: boolean,
): string {
  const label = checkLabel(rule.field);

  if (!answered) {
    return `You did not answer the ${label.toLowerCase()} question, so this check scores at the risk percentile.`;
  }

  const text = textOf(value);
  const snippet = answerSnippet(value);
  const goodHits = (rule.good ?? []).filter((g) => g && text.includes(g.toLowerCase()));
  const badHits = (rule.bad ?? []).filter((b) => b && text.includes(b.toLowerCase()));

  if (badHits.length > 0 && score < 55) {
    return `You reported ${label.toLowerCase()} as "${snippet}", which includes risk signals (${badHits.slice(0, 2).join(", ")}).`;
  }
  if (goodHits.length > 0 && score >= 70) {
    return `You reported ${label.toLowerCase()} as "${snippet}", including positive signals (${goodHits.slice(0, 2).join(", ")}).`;
  }
  if (goodHits.length > 0 && badHits.length > 0) {
    return `You reported ${label.toLowerCase()} as "${snippet}", mixing positive (${goodHits[0]}) and risk (${badHits[0]}) signals.`;
  }
  if (goodHits.length > 0) {
    return `You reported ${label.toLowerCase()} as "${snippet}" with partial positive signals (${goodHits.slice(0, 2).join(", ")}).`;
  }
  if (badHits.length > 0) {
    return `You reported ${label.toLowerCase()} as "${snippet}", which raises concerns (${badHits.slice(0, 2).join(", ")}).`;
  }
  if (score >= 70) {
    return `You reported ${label.toLowerCase()} as "${snippet}", which supports a solid posture for this check.`;
  }
  if (score >= 55) {
    return `You reported ${label.toLowerCase()} as "${snippet}", which is adequate but not strongly evidenced.`;
  }
  return `You reported ${label.toLowerCase()} as "${snippet}", which scores below a production bar for this check.`;
}

function toSubMetricResult(check: SubMetricScore): SubMetricResult {
  return {
    name: check.name,
    score: check.score,
    weight: check.weight,
    evidence: check.evidence,
  };
}

/**
 * Convert nested dimension details into the mission-shaped array:
 * [{ dimension, score, sub_metrics: [...] }, ...]
 */
export function toDimensionResults(details: DimensionDetails): DimensionScoreResult[] {
  return READINESS_DIMENSIONS.map((label) => {
    const detail = details[label];
    const checks = detail?.checks ?? [];
    return {
      dimension: label,
      score: detail?.score ?? 0,
      sub_metrics:
        detail?.sub_metrics ??
        checks.map((c) => ({
          name: c.name ?? c.label,
          score: c.score,
          weight: c.weight,
          evidence: c.evidence,
        })),
    };
  });
}

/**
 * Score one dimension into its nested sub-metric checks plus the weighted
 * aggregate. The aggregate math is identical to the historical scoreDimension
 * so dimension scores, overall, and buckets are unchanged.
 */
export function scoreDimensionDetail(
  report: ReadinessReportV1Partial | Record<string, unknown>,
  dim: DimensionConfig,
  unknownPercentile: number,
): DimensionDetail {
  const checks: SubMetricScore[] = [];
  let weighted = 0;
  let totalW = 0;
  for (const rule of dim.fields) {
    const raw = (report as Record<string, unknown>)[rule.field];
    const answered = !isUnknownField(raw);
    const s = scoreFieldValue(raw, rule, unknownPercentile);
    const w = typeof rule.weight === "number" && rule.weight > 0 ? rule.weight : 1;
    const label = checkLabel(rule.field);
    const answerValue = evidenceAnswerValue(raw);
    const reason = buildSubMetricReason(rule, raw, s, answered);
    checks.push({
      key: rule.field,
      label,
      name: label,
      score: s,
      weight: w,
      answered,
      status: subMetricStatus(s, answered),
      evidence: {
        question_id: rule.field,
        answer_value: answerValue,
        reason,
      },
    });
    weighted += s * w;
    totalW += w;
  }
  const score = totalW <= 0 ? clampScore(unknownPercentile * 100) : clampScore(weighted / totalW);
  const dimWeight = typeof dim.weight === "number" && dim.weight > 0 ? dim.weight : 1;
  const sub_metrics = checks.map(toSubMetricResult);
  return { label: dim.label, score, weight: dimWeight, checks, sub_metrics };
}

export function scoreDimension(
  report: ReadinessReportV1Partial | Record<string, unknown>,
  dim: DimensionConfig,
  unknownPercentile: number,
): number {
  return scoreDimensionDetail(report, dim, unknownPercentile).score;
}

/**
 * Nested breakdown for all five dimensions. Dimensions missing from a partial
 * config fall back to the default seed config so every dimension always ships
 * its sub-metric checks.
 */
export function scoreAllDimensionDetails(
  report: ReadinessReportV1Partial | Record<string, unknown>,
  config: ReadinessScoringConfig = DEFAULT_SCORING_CONFIG,
): DimensionDetails {
  const out = {} as DimensionDetails;
  for (const dim of config.dimensions) {
    out[dim.label] = scoreDimensionDetail(report, dim, config.unknownPercentile);
  }
  for (const label of READINESS_DIMENSIONS) {
    if (!out[label]) {
      const fallback = DEFAULT_SCORING_CONFIG.dimensions.find((d) => d.label === label);
      out[label] = fallback
        ? scoreDimensionDetail(report, fallback, config.unknownPercentile)
        : {
            label,
            score: clampScore(config.unknownPercentile * 100),
            weight: 1,
            checks: [],
            sub_metrics: [],
          };
    }
  }
  return out;
}

export function scoreAllDimensions(
  report: ReadinessReportV1Partial | Record<string, unknown>,
  config: ReadinessScoringConfig = DEFAULT_SCORING_CONFIG,
): DimensionScores {
  const out = {} as DimensionScores;
  for (const dim of config.dimensions) {
    out[dim.label] = scoreDimension(report, dim, config.unknownPercentile);
  }
  // Ensure all five keys exist even if config is partial.
  for (const label of READINESS_DIMENSIONS) {
    if (typeof out[label] !== "number") {
      out[label] = clampScore(config.unknownPercentile * 100);
    }
  }
  return out;
}

export function overallFromDimensions(
  dimensions: DimensionScores,
  config: ReadinessScoringConfig = DEFAULT_SCORING_CONFIG,
): number {
  let weighted = 0;
  let totalW = 0;
  for (const dim of config.dimensions) {
    const s = dimensions[dim.label];
    const w = typeof dim.weight === "number" && dim.weight > 0 ? dim.weight : 1;
    if (typeof s === "number") {
      weighted += s * w;
      totalW += w;
    }
  }
  if (totalW <= 0) return clampScore(config.unknownPercentile * 100);
  return clampScore(weighted / totalW);
}

export function rangesFromDimensions(
  dimensions: DimensionScores,
  halfWidth: number,
): DimensionRanges {
  const out = {} as DimensionRanges;
  for (const label of READINESS_DIMENSIONS) {
    const mid = dimensions[label] ?? 25;
    out[label] = {
      mid,
      low: clampScore(mid - halfWidth),
      high: clampScore(mid + halfWidth),
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Signals for bucketing (deterministic)
// ---------------------------------------------------------------------------

export type BucketSignals = {
  whoUses: string;
  internalOnly: boolean;
  externalUsers: boolean;
  payingUsers: boolean;
  enterpriseCustomers: boolean;
  multiTenantOrEnterprise: boolean;
  ssoOrCompliancePressure: boolean;
  securityQuestionnaire: boolean;
  weakReliability: boolean;
  weakCompliance: boolean;
  solidTool: boolean;
  foundationalGaps: boolean;
  notAFit: boolean;
  stage1Blockers: string[];
};

function stage1WhoUses(stage1?: Partial<ReadinessStage1Answers> | null): string {
  return typeof stage1?.whoUses === "string" ? stage1.whoUses : "";
}

export function deriveBucketSignals(
  report: ReadinessReportV1Partial | Record<string, unknown>,
  dimensions: DimensionScores,
  stage1?: Partial<ReadinessStage1Answers> | null,
  followups?: Record<string, unknown> | null,
): BucketSignals {
  const whoUses = stage1WhoUses(stage1);
  const tenancy = textOf(report.tenancy);
  const auth = `${textOf(report.auth)} ${textOf(report.authorization)}`;
  const pii = textOf(report.pii_categories);
  const summary = textOf(report.summary);
  const fragility = textOf(report.fragility_flags);
  const ssoAnswer = textOf(followups?.sso_saml);
  const securityQAnswer = textOf(followups?.security_questionnaire);
  const usersToday = textOf(followups?.users_today);

  const internalOnly =
    /just me|internal team|internal-only|internal only/i.test(whoUses) ||
    (!/external|enterprise|paying|customers/i.test(whoUses) &&
      /single[-_\s]?tenant|internal/.test(tenancy) &&
      !/multi[-_\s]?tenant|enterprise|b2b/.test(tenancy));

  const externalUsers =
    /external users|enterprise customers|paying/i.test(whoUses) ||
    /external|customer|public|saas/.test(summary);

  const payingUsers =
    /paying|revenue|enterprise customers/i.test(whoUses) ||
    /paying|subscription|billed/.test(summary) ||
    /101–1,000|1,001–10,000|10,000\+/.test(usersToday);

  const enterpriseCustomers = /enterprise customers|enterprise sales/i.test(whoUses);

  const multiTenantOrEnterprise =
    /multi[-_\s]?tenant|\benterprise\b|\bb2b\b|workspaces?|org[_-]?id/.test(tenancy) ||
    /\bsaml\b|\bsso\b|enterprise idp/.test(auth) ||
    enterpriseCustomers ||
    /required|saml|sso/.test(ssoAnswer);

  const ssoOrCompliancePressure =
    /\bsaml\b|\bsso\b/.test(auth) ||
    /soc\s*2|iso\s*27001|hipaa|pci|fedramp|compliance|questionnaire/.test(
      `${summary} ${fragility} ${pii} ${securityQAnswer}`,
    ) ||
    /payment|card|phi|health|medical|hipaa/.test(pii) ||
    /required|yes/.test(securityQAnswer);

  const securityQuestionnaire =
    /security questionnaire|security review|questionnaire blocking|soc\s*2|compliance/i.test(
      `${summary} ${fragility} ${textOf(stage1?.blockers)} ${securityQAnswer}`,
    ) ||
    (Array.isArray(stage1?.blockers) &&
      stage1!.blockers.some((b) => /security questionnaire|customer IT/i.test(String(b)))) ||
    /yes|required|in progress/.test(securityQAnswer);

  const weakReliability = (dimensions.Reliability ?? 50) < 55;
  const weakCompliance = (dimensions["Compliance posture"] ?? 50) < 55;

  const solidTool =
    (dimensions.Security ?? 0) >= 62 &&
    (dimensions.Reliability ?? 0) >= 60 &&
    (dimensions.Operability ?? 0) >= 58 &&
    (dimensions.Maintainability ?? 0) >= 55;

  const foundationalGaps =
    (dimensions.Security ?? 100) < 60 ||
    (dimensions.Reliability ?? 100) < 58 ||
    (dimensions.Operability ?? 100) < 55;

  // Not a fit: extreme emptiness / hobby-only with no product surface (rare after Stage 1).
  const product = typeof stage1?.productDescription === "string" ? stage1.productDescription : "";
  const notAFit =
    (!product || product.trim().length < 3) &&
    isUnknownField(report.summary) &&
    isUnknownField(report.languages) &&
    isUnknownField(report.backend);

  return {
    whoUses,
    internalOnly: internalOnly || whoUses === "Just me" || whoUses === "My internal team",
    externalUsers: externalUsers || enterpriseCustomers,
    payingUsers,
    enterpriseCustomers,
    multiTenantOrEnterprise,
    ssoOrCompliancePressure,
    securityQuestionnaire,
    weakReliability,
    weakCompliance,
    solidTool,
    foundationalGaps,
    notAFit,
    stage1Blockers: Array.isArray(stage1?.blockers) ? stage1!.blockers.map(String) : [],
  };
}

export type BucketResult = {
  bucket: EngagementBucket;
  caveat?: string;
  matchedRule: string;
};

/**
 * Deterministic bucketing — top-down, first match wins.
 */
export function assignEngagementBucket(signals: BucketSignals): BucketResult {
  // 1) Not a fit
  if (signals.notAFit) {
    return { bucket: "Not a fit", matchedRule: "not_a_fit" };
  }

  // 2) Enterprise — multi-tenant/enterprise/SSO/compliance pressure
  if (
    signals.enterpriseCustomers ||
    (signals.multiTenantOrEnterprise && signals.ssoOrCompliancePressure) ||
    (signals.multiTenantOrEnterprise && signals.payingUsers) ||
    (signals.ssoOrCompliancePressure && signals.externalUsers && signals.payingUsers)
  ) {
    return { bucket: "Enterprise", matchedRule: "enterprise_pressure" };
  }

  // 3) Scale — security questionnaire, paying users, weak reliability/compliance
  if (
    signals.securityQuestionnaire &&
    signals.payingUsers &&
    (signals.weakReliability || signals.weakCompliance)
  ) {
    return { bucket: "Scale", matchedRule: "scale_security_questionnaire" };
  }

  // 4) Launch — external users with foundational gaps
  if (signals.externalUsers && signals.foundationalGaps) {
    return { bucket: "Launch", matchedRule: "launch_external_gaps" };
  }

  // 5) Harden — internal-only, solid tool
  if (signals.internalOnly && signals.solidTool && !signals.externalUsers) {
    return { bucket: "Harden", matchedRule: "harden_internal_solid" };
  }

  // Also Harden when clearly internal-only even if scores are mid-solid
  if (
    signals.internalOnly &&
    !signals.externalUsers &&
    !signals.multiTenantOrEnterprise &&
    !signals.ssoOrCompliancePressure &&
    (dimensionsStrongEnoughForHarden(signals) || signals.solidTool)
  ) {
    return { bucket: "Harden", matchedRule: "harden_internal_default" };
  }

  // Unresolved → Launch with talk-to-us caveat
  return {
    bucket: "Launch",
    matchedRule: "default_launch",
    caveat:
      "This profile did not match a single engagement rule cleanly — talk to us and we’ll confirm the right next step.",
  };
}

function dimensionsStrongEnoughForHarden(signals: BucketSignals): boolean {
  // Soft path: internal, not enterprise, not weak everywhere.
  return !signals.weakReliability || !signals.weakCompliance;
}

/**
 * Build headline-only findings (no remediation / how-to-fix language).
 */
export function buildTopFindings(
  report: ReadinessReportV1Partial | Record<string, unknown>,
  dimensions: DimensionScores,
  signals: BucketSignals,
): string[] {
  const findings: string[] = [];

  const ordered = [...READINESS_DIMENSIONS].sort(
    (a, b) => (dimensions[a] ?? 0) - (dimensions[b] ?? 0),
  );

  for (const dim of ordered) {
    if (findings.length >= 3) break;
    const score = dimensions[dim] ?? 0;
    if (score >= 70) continue;
    if (dim === "Security") {
      findings.push(
        isUnknownField(report.auth) || isUnknownField(report.authorization)
          ? "Security controls are incomplete or unverified across auth and authorization"
          : "Security posture shows material gaps relative to production expectations",
      );
    } else if (dim === "Reliability") {
      findings.push(
        isUnknownField(report.tests)
          ? "Test coverage and deploy gates are unknown or missing"
          : "Reliability signals (tests, error handling, fragility) sit below a production bar",
      );
    } else if (dim === "Operability") {
      findings.push(
        isUnknownField(report.deploys)
          ? "Deploy and environment operations are under-specified"
          : "Operability gaps appear in deploys, environments, or observability",
      );
    } else if (dim === "Maintainability") {
      findings.push("Codebase structure and maintainability signals need strengthening");
    } else if (dim === "Compliance posture") {
      findings.push(
        signals.ssoOrCompliancePressure
          ? "Compliance and identity pressure exceeds current isolation and control signals"
          : "Compliance posture is thin for the data and tenancy model described",
      );
    }
  }

  if (findings.length < 3 && signals.securityQuestionnaire) {
    findings.push("A security questionnaire or review is already in the commercial path");
  }
  if (findings.length < 3 && signals.multiTenantOrEnterprise) {
    findings.push("Multi-tenant or enterprise identity requirements raise the production bar");
  }
  if (findings.length < 3 && signals.externalUsers) {
    findings.push("External users raise reliability and security expectations");
  }
  if (findings.length < 3 && signals.internalOnly) {
    findings.push("Internal tooling still needs durable access control and operability");
  }
  if (findings.length < 3) {
    findings.push("Production foundations need a clearer, fixed-scope plan");
  }

  // Hard strip any remediation-ish wording if it slipped in.
  return findings.slice(0, 3).map(stripRemediationLanguage);
}

const REMEDIATION_PATTERNS =
  /\b(how to fix|remediat|mitigate by|you should|implement |add (?:a |an )?(?:test|monitor|backup)|fix:|solution:)\b/i;

function stripRemediationLanguage(headline: string): string {
  if (!REMEDIATION_PATTERNS.test(headline)) return headline;
  return headline
    .replace(REMEDIATION_PATTERNS, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function buildEngagementReasoning(
  report: ReadinessReportV1Partial | Record<string, unknown>,
  signals: BucketSignals,
  bucket: EngagementBucket,
  dimensions: DimensionScores,
): string {
  const summary =
    typeof report.summary === "string" && report.summary.trim()
      ? report.summary.trim()
      : signals.whoUses
        ? `a product used by ${signals.whoUses.toLowerCase()}`
        : "this product";

  const tenancy =
    typeof report.tenancy === "string" && report.tenancy.trim()
      ? report.tenancy.trim()
      : "an unspecified tenancy model";

  const tests =
    typeof report.tests === "string" && report.tests.trim()
      ? report.tests.trim()
      : "unknown test posture";

  const auth =
    typeof report.auth === "string" && report.auth.trim()
      ? report.auth.trim()
      : "unspecified authentication";

  const s1 = dimensions.Security != null ? `Security ${dimensions.Security}` : "Security n/a";
  const s2 =
    dimensions.Reliability != null ? `Reliability ${dimensions.Reliability}` : "Reliability n/a";

  if (bucket === "Harden") {
    return [
      `Based on your submission describing ${summary}, with ${tenancy} and ${auth}, this looks like an internal tool with enough foundation to improve in a focused engagement.`,
      `Scores (${s1}, ${s2}) and your user model (${signals.whoUses || "internal"}) support a Harden path rather than a full multi-tenant rebuild.`,
      `Tests were reported as: ${tests}.`,
    ].join(" ");
  }

  if (bucket === "Enterprise") {
    return [
      `Your answers describe ${summary} with enterprise or multi-tenant pressure (${tenancy}; ${auth}).`,
      `Compliance or SSO signals, combined with ${s1} and ${s2}, point to an Enterprise-grade engagement rather than a lightweight fix.`,
      `We recommend locking scope with an audit before a fixed-price rebuild.`,
    ].join(" ");
  }

  if (bucket === "Scale") {
    return [
      `You reported paying or growing usage alongside a security questionnaire path, while reliability/compliance scores remain soft (${s2}; Compliance ${dimensions["Compliance posture"] ?? "n/a"}).`,
      `Product context: ${summary}. Tenancy: ${tenancy}.`,
      `Scale is the fit when commercial pressure is real but foundations still need a serious rebuild plan.`,
    ].join(" ");
  }

  if (bucket === "Not a fit") {
    return [
      `The submission does not yet describe a working product surface we can score confidently.`,
      `Come back when there is a runnable build and clearer stack answers so we can recommend an engagement.`,
      `No audit or build path is appropriate until basics are present.`,
    ].join(" ");
  }

  // Launch (including default)
  return [
    `Your report describes ${summary} used by ${signals.whoUses || "external or mixed users"}, with foundational gaps in scores (${s1}, ${s2}).`,
    `Stack signals include ${tenancy} and tests as: ${tests}.`,
    `Launch is the recommended engagement to put production foundations under a fixed scope before growth pressure compounds risk.`,
  ].join(" ");
}

export function engagementMeta(bucket: EngagementBucket): {
  recommendedEngagement: string;
  offerKey: "harden" | "audit" | "build" | "general";
  ctaLabel: string;
} {
  if (bucket === "Harden") {
    return {
      recommendedEngagement: "vygo Harden",
      offerKey: "harden",
      ctaLabel: "Start free Harden assessment",
    };
  }
  if (bucket === "Not a fit") {
    return {
      recommendedEngagement: "Not a fit yet",
      offerKey: "general",
      ctaLabel: "Apply for the next audit opening",
    };
  }
  if (bucket === "Enterprise") {
    return {
      recommendedEngagement: "Enterprise rebuild (via Production Readiness Audit)",
      offerKey: "audit",
      ctaLabel: "Apply for the next audit opening",
    };
  }
  if (bucket === "Scale") {
    return {
      recommendedEngagement: "Scale rebuild (via Production Readiness Audit)",
      offerKey: "audit",
      ctaLabel: "Apply for the next audit opening",
    };
  }
  return {
    recommendedEngagement: "Launch rebuild (via Production Readiness Audit)",
    offerKey: "audit",
    ctaLabel: "Apply for the next audit opening",
  };
}

export type ComputeScoreInput = {
  report: ReadinessReportV1Partial | Record<string, unknown>;
  source?: ScoringSource | string | null;
  stage1?: Partial<ReadinessStage1Answers> | null;
  followups?: Record<string, unknown> | null;
  config?: ReadinessScoringConfig | null;
};

/**
 * Full score + bucket + reasoning computation.
 * Config must supply dimension weights; falls back to DEFAULT_SCORING_CONFIG.
 */
export function computeReadinessScore(input: ComputeScoreInput): ReadinessScorePayload {
  const config = normalizeScoringConfig(input.config);
  const report = (input.report ?? {}) as Record<string, unknown>;
  const source: ScoringSource =
    input.source === "manual" || input.source === "paste" || input.source === "unknown"
      ? input.source
      : textOf(input.source) === "manual"
        ? "manual"
        : "paste";

  const dimensionDetails = scoreAllDimensionDetails(report, config);
  const dimensions = scoreAllDimensions(report, config);
  const dimensionResults = toDimensionResults(dimensionDetails);
  const insights = buildEvidenceInsights(report, dimensionDetails);
  const overall = overallFromDimensions(dimensions, config);
  const signals = deriveBucketSignals(report, dimensions, input.stage1, input.followups);
  const bucketResult = assignEngagementBucket(signals);
  const findings = buildTopFindings(report, dimensions, signals);
  const reasoning = buildEngagementReasoning(report, signals, bucketResult.bucket, dimensions);
  const meta = engagementMeta(bucketResult.bucket);
  const detailed = buildDetailedAnalysis({
    report,
    dimensions,
    dimensionDetails,
    insights,
    bucket: bucketResult.bucket,
  });

  // Prefer pattern-branched engagement name when it specializes the coarse bucket
  // (e.g. security-first Harden). Keep offerKey aligned with the specialized path.
  const specializedEngagement = detailed.recommendation.engagement;
  const specializedOffer =
    detailed.recommendation.patternKey === "security_first_high_adoption" ||
    detailed.recommendation.patternKey === "bucket_harden"
      ? ("harden" as const)
      : detailed.recommendation.patternKey === "bucket_not_a_fit"
        ? ("general" as const)
        : meta.offerKey;

  const displayMode: "point" | "range" = source === "manual" ? "range" : "point";
  const ranges =
    displayMode === "range"
      ? rangesFromDimensions(dimensions, config.manualRangeHalfWidth)
      : undefined;

  return {
    version: config.version,
    source,
    displayMode,
    dimensions,
    dimensionDetails,
    dimensionResults,
    insights,
    dimensionAnalyses: detailed.dimensionAnalyses,
    recommendation: detailed.recommendation,
    ranges,
    overall,
    bucket: bucketResult.bucket,
    reasoning,
    caveat: bucketResult.caveat,
    findings,
    recommendedEngagement: specializedEngagement || meta.recommendedEngagement,
    offerKey: specializedOffer,
    ctaLabel: meta.ctaLabel,
    pricing: { ...config.pricing },
    configKey: config.configKey,
    configVersion: config.version,
  };
}

/**
 * Parse a DB scoring_config row (rules + weights jsonb) into ReadinessScoringConfig.
 * Always merges DB weights onto DEFAULT_SCORING_CONFIG so good/bad keyword patterns
 * stay available even when the seed only stores numeric weights.
 */
export function scoringConfigFromDbRow(
  row: {
    configKey?: string | null;
    version?: number | null;
    rules?: unknown;
    weights?: unknown;
  } | null,
): ReadinessScoringConfig {
  if (!row) return DEFAULT_SCORING_CONFIG;
  const rules =
    row.rules && typeof row.rules === "object" && !Array.isArray(row.rules)
      ? (row.rules as Record<string, unknown>)
      : {};
  const weights =
    row.weights && typeof row.weights === "object" && !Array.isArray(row.weights)
      ? (row.weights as Record<string, unknown>)
      : {};

  const base = structuredClone(DEFAULT_SCORING_CONFIG) as ReadinessScoringConfig;
  base.configKey = row.configKey || base.configKey;
  base.version = typeof row.version === "number" ? row.version : base.version;

  if (typeof rules.unknownPercentile === "number") {
    base.unknownPercentile = rules.unknownPercentile;
  }
  if (typeof rules.manualRangeHalfWidth === "number") {
    base.manualRangeHalfWidth = rules.manualRangeHalfWidth;
  }
  if (rules.pricing && typeof rules.pricing === "object" && !Array.isArray(rules.pricing)) {
    base.pricing = {
      ...base.pricing,
      ...(rules.pricing as ReadinessScoringConfig["pricing"]),
    };
  }

  // Overlay dimension / field weights from rules.dimensions and/or flat weights map.
  const ruleDims = Array.isArray(rules.dimensions)
    ? (rules.dimensions as Array<Record<string, unknown>>)
    : [];
  if (ruleDims.length > 0) {
    for (const rd of ruleDims) {
      const label = String(rd.label ?? "");
      const dim = base.dimensions.find((d) => d.label === label);
      if (!dim) continue;
      if (typeof rd.weight === "number") dim.weight = rd.weight;
      const fields = Array.isArray(rd.fields) ? (rd.fields as Array<Record<string, unknown>>) : [];
      for (const rf of fields) {
        const fieldName = String(rf.field ?? "");
        const f = dim.fields.find((x) => x.field === fieldName);
        if (f && typeof rf.weight === "number") f.weight = rf.weight;
        // Allow DB seed to extend good/bad lists when present.
        if (f && Array.isArray(rf.good)) f.good = rf.good.map(String);
        if (f && Array.isArray(rf.bad)) f.bad = rf.bad.map(String);
      }
    }
  }

  if (Object.keys(weights).length > 0) {
    for (const dim of base.dimensions) {
      const dimKey = `dimension:${dim.label}`;
      if (typeof weights[dimKey] === "number") {
        dim.weight = weights[dimKey] as number;
      }
      for (const f of dim.fields) {
        if (typeof weights[f.field] === "number") {
          f.weight = weights[f.field] as number;
        }
      }
    }
  }

  return normalizeScoringConfig(base);
}

export function normalizeScoringConfig(
  config?: Partial<ReadinessScoringConfig> | null,
): ReadinessScoringConfig {
  if (!config) return DEFAULT_SCORING_CONFIG;
  const dimensions =
    Array.isArray(config.dimensions) && config.dimensions.length > 0
      ? config.dimensions
      : DEFAULT_SCORING_CONFIG.dimensions;
  return {
    configKey: config.configKey || DEFAULT_SCORING_CONFIG.configKey,
    version: typeof config.version === "number" ? config.version : DEFAULT_SCORING_CONFIG.version,
    unknownPercentile:
      typeof config.unknownPercentile === "number"
        ? config.unknownPercentile
        : DEFAULT_SCORING_CONFIG.unknownPercentile,
    manualRangeHalfWidth:
      typeof config.manualRangeHalfWidth === "number"
        ? config.manualRangeHalfWidth
        : DEFAULT_SCORING_CONFIG.manualRangeHalfWidth,
    dimensions,
    pricing: {
      ...DEFAULT_SCORING_CONFIG.pricing,
      ...(config.pricing ?? {}),
    },
  };
}

/** JSON blob for DB seed (rules column). */
export function defaultScoringRulesJson(): Record<string, unknown> {
  const c = DEFAULT_SCORING_CONFIG;
  return {
    version: c.version,
    unknownPercentile: c.unknownPercentile,
    manualRangeHalfWidth: c.manualRangeHalfWidth,
    dimensions: c.dimensions,
    pricing: c.pricing,
    buckets: ["Not a fit", "Enterprise", "Scale", "Launch", "Harden"],
  };
}

/** JSON blob for DB seed (weights column) — flat field → weight map. */
export function defaultScoringWeightsJson(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const dim of DEFAULT_SCORING_CONFIG.dimensions) {
    out[`dimension:${dim.label}`] = dim.weight;
    for (const f of dim.fields) {
      // Last write wins if a field appears in multiple dimensions — OK for overlay.
      out[f.field] = f.weight;
    }
  }
  return out;
}

/** True when text looks like remediation detail (for API response scrubbing). */
export function containsRemediationDetail(text: string): boolean {
  return REMEDIATION_PATTERNS.test(text);
}
