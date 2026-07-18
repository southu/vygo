/**
 * Live data loaders for readiness chart components.
 * Prefers a real snapshot when ?id= is provided; otherwise scores a mixed
 * assessment report via the public score-preview dry-run (same engine as
 * POST /v1/readiness/score, no Turnstile / lead capture).
 */
import { apiUrl } from "@/lib/api";
import { getReadinessSnapshot, type SnapshotResponse } from "@/lib/readiness/api";
import type {
  ChartDimension,
  ChartEvidence,
  ChartSubMetric,
  ReadinessChartData,
} from "@/components/charts/types";
import { hasChartEvidence, pickDimensionEvidence } from "@/components/charts/types";

/**
 * Intentionally mixed posture report so dimensions and sub-metrics span
 * critical / warning / good bands (auth strong, secrets weak, tests none, etc.).
 * Mirrors a real paste-source assessment answer set.
 */
export const STAGING_MIXED_REPORT: Record<string, unknown> = {
  summary: "Staging charts mixed-posture AI agent platform",
  languages: "TypeScript",
  size: "medium",
  structure: "modular monorepo packages",
  frontend: "Next.js",
  backend: "Fastify",
  database: "Postgres",
  tenancy: "multi-tenant org_id",
  auth: "session cookies + magic link",
  authorization: "RBAC roles owner admin member",
  row_level_security: "none",
  environments: "local staging production",
  deploys: "manual ssh",
  tests: "none",
  background_jobs: "email outbox worker with retry",
  integrations: "Slack",
  secrets_pattern: "hardcoded in git",
  logging: "structured JSON logs request ids",
  error_handling: "unhandled stack traces",
  pii_categories: "email, name; no payment card or health records in prod",
  api_surface: "HTTPS /v1 versioned API with auth",
  fragility_flags: ["single region", "no backup"],
  confidence: 0.7,
};

type PreviewEvidence = {
  question_id?: string;
  answer_value?: unknown;
  reason?: string;
};

type PreviewBody = {
  overall?: number;
  dimensions?: Record<string, number>;
  scores?: Record<string, number>;
  dimensionResults?: Array<{
    dimension: string;
    score: number;
    sub_metrics?: Array<{
      name: string;
      score: number;
      weight?: number;
      evidence?: PreviewEvidence;
    }>;
  }>;
  dimensionDetails?: Record<
    string,
    {
      label?: string;
      score?: number;
      checks?: Array<{
        key?: string;
        label?: string;
        name?: string;
        score?: number;
        weight?: number;
        evidence?: PreviewEvidence;
      }>;
      sub_metrics?: Array<{
        name: string;
        score: number;
        weight?: number;
        evidence?: PreviewEvidence;
      }>;
    }
  >;
  bucket?: string;
  error?: { message?: string };
};

function parseEvidence(raw: PreviewEvidence | null | undefined): ChartEvidence | null {
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

function withDimensionEvidence(dims: ChartDimension[]): ChartDimension[] {
  return dims.map((d) => ({
    ...d,
    evidence: hasChartEvidence(d.evidence) ? d.evidence : pickDimensionEvidence(d.sub_metrics),
  }));
}

function pickOverallEvidence(dims: ChartDimension[]): ChartEvidence | null {
  const ranked = dims
    .flatMap((d) => d.sub_metrics.map((sm) => ({ score: sm.score, evidence: sm.evidence })))
    .filter((row) => hasChartEvidence(row.evidence))
    .sort((a, b) => a.score - b.score);
  return ranked[0]?.evidence ?? null;
}

function normalizeDimensions(body: PreviewBody): ChartDimension[] {
  if (Array.isArray(body.dimensionResults) && body.dimensionResults.length > 0) {
    return withDimensionEvidence(
      body.dimensionResults.map((d) => {
        const sub_metrics: ChartSubMetric[] = Array.isArray(d.sub_metrics)
          ? d.sub_metrics.map((sm) => ({
              name: sm.name,
              score: typeof sm.score === "number" ? sm.score : 0,
              weight: sm.weight,
              evidence: parseEvidence(sm.evidence),
            }))
          : [];
        return {
          dimension: d.dimension,
          score: typeof d.score === "number" ? d.score : 0,
          sub_metrics,
        };
      }),
    );
  }

  const details = body.dimensionDetails;
  if (details && typeof details === "object") {
    return withDimensionEvidence(
      Object.entries(details).map(([key, detail]) => {
        const checks = Array.isArray(detail.checks) ? detail.checks : [];
        const subFromChecks: ChartSubMetric[] = checks.map((c) => ({
          name: c.name || c.label || c.key || "Check",
          score: typeof c.score === "number" ? c.score : 0,
          weight: c.weight,
          key: c.key,
          evidence: parseEvidence(c.evidence),
        }));
        const sub: ChartSubMetric[] =
          subFromChecks.length > 0
            ? subFromChecks
            : Array.isArray(detail.sub_metrics)
              ? detail.sub_metrics.map((sm) => ({
                  name: sm.name,
                  score: typeof sm.score === "number" ? sm.score : 0,
                  weight: sm.weight,
                  evidence: parseEvidence(sm.evidence),
                }))
              : [];
        return {
          dimension: detail.label || key,
          score: typeof detail.score === "number" ? detail.score : 0,
          sub_metrics: sub,
        };
      }),
    );
  }

  const scores = body.dimensions || body.scores || {};
  return Object.entries(scores).map(([dimension, score]) => ({
    dimension,
    score: typeof score === "number" ? score : 0,
    sub_metrics: [],
    evidence: null,
  }));
}

/** Live score-preview of the mixed staging report (same scoring engine as submissions). */
export async function fetchStagingChartPreview(): Promise<ReadinessChartData> {
  const res = await fetch(apiUrl("/v1/readiness/score-preview"), {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      source: "paste",
      report: STAGING_MIXED_REPORT,
    }),
    credentials: "same-origin",
    cache: "no-store",
  });

  let body: PreviewBody = {};
  try {
    body = (await res.json()) as PreviewBody;
  } catch {
    body = {};
  }

  if (!res.ok) {
    throw new Error(body.error?.message || "Could not load readiness chart data.");
  }

  const dimensions = normalizeDimensions(body);
  if (dimensions.length === 0) {
    throw new Error("Score preview returned no dimensions.");
  }

  const overall =
    typeof body.overall === "number"
      ? body.overall
      : Math.round(
          dimensions.reduce((sum, d) => sum + d.score, 0) / Math.max(1, dimensions.length),
        );

  return {
    overall,
    dimensions,
    overallEvidence: pickOverallEvidence(dimensions),
    sourceLabel: "Live score-preview · mixed test assessment",
    bucket: typeof body.bucket === "string" ? body.bucket : null,
  };
}

function finiteChartScore(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(100, value));
  }
  return fallback;
}

/** Build chart data from an already-loaded snapshot response. */
export function chartDataFromSnapshot(snap: SnapshotResponse): ReadinessChartData {
  const dimensions: ChartDimension[] = [];

  if (Array.isArray(snap.dimensionResults) && snap.dimensionResults.length > 0) {
    for (const d of snap.dimensionResults) {
      if (typeof d.score !== "number" || !Number.isFinite(d.score)) continue;
      const sub_metrics: ChartSubMetric[] = (d.sub_metrics || []).map((sm) => ({
        name: sm.name,
        score: finiteChartScore(sm.score),
        weight: sm.weight,
        evidence: parseEvidence(sm.evidence),
      }));
      dimensions.push({
        dimension: d.dimension,
        score: finiteChartScore(d.score),
        sub_metrics,
        evidence: pickDimensionEvidence(sub_metrics),
      });
    }
  } else if (snap.dimensionDetails) {
    for (const [key, detail] of Object.entries(snap.dimensionDetails)) {
      if (typeof detail.score !== "number" || !Number.isFinite(detail.score)) continue;
      const sub_metrics: ChartSubMetric[] = (detail.checks || []).map((c) => ({
        name: c.name || c.label || c.key,
        score: finiteChartScore(c.score),
        weight: c.weight,
        key: c.key,
        evidence: parseEvidence(c.evidence ?? undefined),
      }));
      dimensions.push({
        dimension: detail.label || key,
        score: finiteChartScore(detail.score),
        sub_metrics,
        evidence: pickDimensionEvidence(sub_metrics),
      });
    }
  } else if (snap.scores) {
    for (const [dimension, score] of Object.entries(snap.scores)) {
      if (typeof score === "number" && Number.isFinite(score)) {
        dimensions.push({
          dimension,
          score: finiteChartScore(score),
          sub_metrics: [],
          evidence: null,
        });
      }
    }
  }

  if (dimensions.length === 0) {
    throw new Error("Snapshot has no scored dimensions.");
  }

  const overall =
    typeof snap.overall === "number" && Number.isFinite(snap.overall)
      ? finiteChartScore(snap.overall)
      : Math.round(
          dimensions.reduce((sum, d) => sum + d.score, 0) / Math.max(1, dimensions.length),
        );

  return {
    overall,
    dimensions,
    overallEvidence: pickOverallEvidence(dimensions),
    sourceLabel: `Snapshot ${snap.id}`,
    bucket: snap.bucket,
  };
}

/** Load chart data from a real shareable snapshot id. */
export async function fetchChartDataFromSnapshot(id: string): Promise<ReadinessChartData> {
  const snap = await getReadinessSnapshot(id);
  return chartDataFromSnapshot(snap);
}

/**
 * Resolve live chart data: prefer real snapshot when id is set, else mixed
 * score-preview assessment (live engine, varied bands).
 */
export async function loadStagingChartData(
  snapshotId?: string | null,
): Promise<ReadinessChartData> {
  if (snapshotId && snapshotId.trim()) {
    try {
      return await fetchChartDataFromSnapshot(snapshotId.trim());
    } catch {
      // Fall through to preview so the staging page still renders.
    }
  }
  return fetchStagingChartPreview();
}
