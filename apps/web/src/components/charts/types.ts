/** Shared chart payload types (mirrors readiness score API shapes). */

/**
 * Real sub-metric evidence from a prospect submission.
 * Never invent or hardcode these values in the UI — only pass through from scoring.
 */
export type ChartEvidence = {
  question_id: string;
  answer_value: unknown;
  reason: string;
};

export type ChartSubMetric = {
  name: string;
  score: number;
  weight?: number;
  key?: string;
  /** Present only when the scoring payload includes a real evidence record. */
  evidence?: ChartEvidence | null;
};

export type ChartDimension = {
  dimension: string;
  score: number;
  sub_metrics: ChartSubMetric[];
  /**
   * Representative evidence for dimension-level interactions (radar axis / gauge
   * segment). Derived from a real sub-metric when available — never filler.
   */
  evidence?: ChartEvidence | null;
  /**
   * Human-readable name of the dimension's top critical risk factor — the
   * lowest-scored sub-metric that carries real evidence. Never invented:
   * populated only from a real sub-metric label (see pickDimensionRiskFactor).
   */
  riskFactor?: string;
};

export type ReadinessChartData = {
  overall: number;
  dimensions: ChartDimension[];
  /** Optional source label for staging UI (snapshot id or preview). */
  sourceLabel?: string;
  bucket?: string | null;
  /** Optional overall-level evidence (e.g. weakest sub-metric driving the blend). */
  overallEvidence?: ChartEvidence | null;
};

/** True when evidence has a non-empty reason (required for tooltip display). */
export function hasChartEvidence(
  evidence: ChartEvidence | null | undefined,
): evidence is ChartEvidence {
  return Boolean(
    evidence && typeof evidence.reason === "string" && evidence.reason.trim().length > 0,
  );
}

/** Bound free-text answers in tooltips / callouts so layout never overflows. */
export const EVIDENCE_ANSWER_MAX_CHARS = 220;

/** Collapse whitespace and truncate with a clean ellipsis (code-point safe). */
export function clipEvidenceText(value: string, max = EVIDENCE_ANSWER_MAX_CHARS): string {
  const t = value.replace(/\s+/g, " ").trim();
  if (!t) return "";
  // Array.from iterates code points so surrogate pairs (emoji) are never split.
  const points = Array.from(t);
  if (points.length <= max) return t;
  if (max <= 1) return "…";
  return `${points.slice(0, max - 1).join("")}…`;
}

/** Format a prospect answer value for tooltip display (never placeholder filler). */
export function formatEvidenceAnswer(value: unknown, max = EVIDENCE_ANSWER_MAX_CHARS): string {
  if (value == null) return "";
  let raw = "";
  if (typeof value === "string") raw = value.trim();
  else if (typeof value === "number" || typeof value === "boolean") raw = String(value);
  else if (Array.isArray(value)) {
    raw = value
      .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
      .filter(Boolean)
      .join(", ");
  } else {
    try {
      raw = JSON.stringify(value);
    } catch {
      raw = String(value);
    }
  }
  return clipEvidenceText(raw, max);
}

/**
 * Pick representative evidence for a dimension: prefer the lowest-scored
 * sub-metric that has real evidence (highlights the binding constraint).
 */
export function pickDimensionEvidence(subMetrics: ChartSubMetric[]): ChartEvidence | null {
  return pickDimensionRiskSubMetric(subMetrics)?.evidence ?? null;
}

/**
 * The dimension's binding constraint: the lowest-scored sub-metric that has real
 * evidence. This is the "top critical risk factor" surfaced in radar tooltips.
 */
export function pickDimensionRiskSubMetric(subMetrics: ChartSubMetric[]): ChartSubMetric | null {
  const withEv = subMetrics
    .filter((sm) => hasChartEvidence(sm.evidence))
    .slice()
    .sort((a, b) => a.score - b.score);
  return withEv[0] ?? null;
}

/** Name of the dimension's top critical risk factor (lowest sub-metric with evidence). */
export function pickDimensionRiskFactor(subMetrics: ChartSubMetric[]): string | undefined {
  const sm = pickDimensionRiskSubMetric(subMetrics);
  const name = sm?.name?.trim();
  return name ? name : undefined;
}
