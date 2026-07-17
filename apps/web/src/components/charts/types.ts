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
    evidence &&
      typeof evidence.reason === "string" &&
      evidence.reason.trim().length > 0,
  );
}

/** Format a prospect answer value for tooltip display (never placeholder filler). */
export function formatEvidenceAnswer(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
      .filter(Boolean)
      .join(", ");
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Pick representative evidence for a dimension: prefer the lowest-scored
 * sub-metric that has real evidence (highlights the binding constraint).
 */
export function pickDimensionEvidence(
  subMetrics: ChartSubMetric[],
): ChartEvidence | null {
  const withEv = subMetrics
    .filter((sm) => hasChartEvidence(sm.evidence))
    .slice()
    .sort((a, b) => a.score - b.score);
  return withEv[0]?.evidence ?? null;
}
