/**
 * Server-only builder that turns the build-time readiness report
 * (apps/web/src/generated/readiness.json → analysis.selfAssessment) into radar
 * chart data. The self-assessment is scored by the same engine as prospect
 * submissions, so every tooltip's risk factor is derived from real report data —
 * never invented or hardcoded here.
 *
 * Only import this from Server Components: the JSON is large and must not ship in
 * a client bundle. Client components receive the small, serialized result props.
 */
import readinessReport from "@/generated/readiness.json";
import type {
  ChartDimension,
  ChartEvidence,
  ChartSubMetric,
  ReadinessChartData,
} from "@/components/charts/types";
import {
  hasChartEvidence,
  pickDimensionEvidence,
  pickDimensionRiskFactor,
} from "@/components/charts/types";

type RawEvidence = {
  question_id?: unknown;
  answer_value?: unknown;
  reason?: unknown;
};

type RawSubMetric = {
  name?: unknown;
  score?: unknown;
  weight?: unknown;
  evidence?: RawEvidence | null;
};

type RawDimension = {
  dimension?: unknown;
  score?: unknown;
  sub_metrics?: RawSubMetric[];
};

type SelfAssessment = {
  overall?: unknown;
  bucket?: unknown;
  dimensionResults?: RawDimension[];
};

function toEvidence(raw: RawEvidence | null | undefined): ChartEvidence | null {
  if (!raw || typeof raw !== "object") return null;
  const question_id = typeof raw.question_id === "string" ? raw.question_id.trim() : "";
  const reason = typeof raw.reason === "string" ? raw.reason.trim() : "";
  if (!question_id || !reason) return null;
  return {
    question_id,
    answer_value: "answer_value" in raw ? raw.answer_value : null,
    reason,
  };
}

function finiteScore(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, value))
    : 0;
}

/** One row of the compact risk map embedded in the page source for verification. */
export type DimensionRisk = {
  dimension: string;
  score: number;
  /** Name of the top critical risk factor (lowest scored sub-metric with evidence). */
  riskFactor: string;
  riskScore: number;
  reason: string;
  question_id: string;
};

function buildDimensions(sa: SelfAssessment): ChartDimension[] {
  const rows = Array.isArray(sa.dimensionResults) ? sa.dimensionResults : [];
  const dims: ChartDimension[] = [];
  for (const d of rows) {
    const name = typeof d.dimension === "string" ? d.dimension.trim() : "";
    if (!name) continue;
    const sub_metrics: ChartSubMetric[] = (Array.isArray(d.sub_metrics) ? d.sub_metrics : []).map(
      (sm) => ({
        name: typeof sm.name === "string" ? sm.name : "",
        score: finiteScore(sm.score),
        weight: typeof sm.weight === "number" ? sm.weight : undefined,
        evidence: toEvidence(sm.evidence),
      }),
    );
    dims.push({
      dimension: name,
      score: finiteScore(d.score),
      sub_metrics,
      evidence: pickDimensionEvidence(sub_metrics),
      riskFactor: pickDimensionRiskFactor(sub_metrics),
    });
  }
  return dims;
}

let cachedChartData: ReadinessChartData | null = null;

/** Radar-ready chart data derived from the build-time self-assessment report. */
export function getReadinessReportChartData(): ReadinessChartData {
  if (cachedChartData) return cachedChartData;
  const report = readinessReport as unknown as {
    analysis?: { selfAssessment?: SelfAssessment };
  };
  const sa: SelfAssessment = report.analysis?.selfAssessment ?? {};
  const dimensions = buildDimensions(sa);

  const overall =
    typeof sa.overall === "number" && Number.isFinite(sa.overall)
      ? finiteScore(sa.overall)
      : dimensions.length > 0
        ? Math.round(dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length)
        : 0;

  cachedChartData = {
    overall,
    dimensions,
    bucket: typeof sa.bucket === "string" ? sa.bucket : null,
    sourceLabel: "Readiness self-assessment",
  };
  return cachedChartData;
}

/**
 * Compact dimension → top-critical-risk map embedded in the readiness page
 * source so the tooltip risk text is machine-verifiable against report data.
 */
export function getReadinessReportRiskMap(): DimensionRisk[] {
  const { dimensions } = getReadinessReportChartData();
  const risks: DimensionRisk[] = [];
  for (const d of dimensions) {
    const riskSub = d.sub_metrics
      .filter((sm) => hasChartEvidence(sm.evidence))
      .slice()
      .sort((a, b) => a.score - b.score)[0];
    if (!riskSub || !hasChartEvidence(riskSub.evidence)) continue;
    risks.push({
      dimension: d.dimension,
      score: Math.round(d.score),
      riskFactor: d.riskFactor ?? riskSub.name,
      riskScore: Math.round(riskSub.score),
      reason: riskSub.evidence.reason,
      question_id: riskSub.evidence.question_id,
    });
  }
  return risks;
}
