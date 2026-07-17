/**
 * Live data loaders for readiness chart components.
 * Prefers a real snapshot when ?id= is provided; otherwise scores a mixed
 * assessment report via the public score-preview dry-run (same engine as
 * POST /v1/readiness/score, no Turnstile / lead capture).
 */
import { apiUrl } from "@/lib/api";
import { getReadinessSnapshot } from "@/lib/readiness/api";
import type { ChartDimension, ReadinessChartData } from "@/components/charts/types";

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

type PreviewBody = {
  overall?: number;
  dimensions?: Record<string, number>;
  scores?: Record<string, number>;
  dimensionResults?: Array<{
    dimension: string;
    score: number;
    sub_metrics?: Array<{ name: string; score: number; weight?: number }>;
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
      }>;
      sub_metrics?: Array<{ name: string; score: number; weight?: number }>;
    }
  >;
  bucket?: string;
  error?: { message?: string };
};

function normalizeDimensions(body: PreviewBody): ChartDimension[] {
  if (Array.isArray(body.dimensionResults) && body.dimensionResults.length > 0) {
    return body.dimensionResults.map((d) => ({
      dimension: d.dimension,
      score: typeof d.score === "number" ? d.score : 0,
      sub_metrics: Array.isArray(d.sub_metrics)
        ? d.sub_metrics.map((sm) => ({
            name: sm.name,
            score: typeof sm.score === "number" ? sm.score : 0,
            weight: sm.weight,
          }))
        : [],
    }));
  }

  const details = body.dimensionDetails;
  if (details && typeof details === "object") {
    return Object.entries(details).map(([key, detail]) => {
      const checks = Array.isArray(detail.checks) ? detail.checks : [];
      const subFromChecks = checks.map((c) => ({
        name: c.name || c.label || c.key || "Check",
        score: typeof c.score === "number" ? c.score : 0,
        weight: c.weight,
        key: c.key,
      }));
      const sub =
        subFromChecks.length > 0
          ? subFromChecks
          : Array.isArray(detail.sub_metrics)
            ? detail.sub_metrics.map((sm) => ({
                name: sm.name,
                score: typeof sm.score === "number" ? sm.score : 0,
                weight: sm.weight,
              }))
            : [];
      return {
        dimension: detail.label || key,
        score: typeof detail.score === "number" ? detail.score : 0,
        sub_metrics: sub,
      };
    });
  }

  const scores = body.dimensions || body.scores || {};
  return Object.entries(scores).map(([dimension, score]) => ({
    dimension,
    score: typeof score === "number" ? score : 0,
    sub_metrics: [],
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
    sourceLabel: "Live score-preview · mixed test assessment",
    bucket: typeof body.bucket === "string" ? body.bucket : null,
  };
}

/** Load chart data from a real shareable snapshot id. */
export async function fetchChartDataFromSnapshot(id: string): Promise<ReadinessChartData> {
  const snap = await getReadinessSnapshot(id);
  const dimensions: ChartDimension[] = [];

  if (Array.isArray(snap.dimensionResults) && snap.dimensionResults.length > 0) {
    for (const d of snap.dimensionResults) {
      dimensions.push({
        dimension: d.dimension,
        score: d.score,
        sub_metrics: (d.sub_metrics || []).map((sm) => ({
          name: sm.name,
          score: sm.score,
          weight: sm.weight,
        })),
      });
    }
  } else if (snap.dimensionDetails) {
    for (const [key, detail] of Object.entries(snap.dimensionDetails)) {
      dimensions.push({
        dimension: detail.label || key,
        score: detail.score,
        sub_metrics: (detail.checks || []).map((c) => ({
          name: c.name || c.label || c.key,
          score: c.score,
          weight: c.weight,
          key: c.key,
        })),
      });
    }
  } else if (snap.scores) {
    for (const [dimension, score] of Object.entries(snap.scores)) {
      if (typeof score === "number") {
        dimensions.push({ dimension, score, sub_metrics: [] });
      }
    }
  }

  if (dimensions.length === 0) {
    throw new Error("Snapshot has no scored dimensions.");
  }

  const overall =
    typeof snap.overall === "number"
      ? snap.overall
      : Math.round(
          dimensions.reduce((sum, d) => sum + d.score, 0) / Math.max(1, dimensions.length),
        );

  return {
    overall,
    dimensions,
    sourceLabel: `Snapshot ${snap.id}`,
    bucket: snap.bucket,
  };
}

/**
 * Resolve live chart data: prefer real snapshot when id is set, else mixed
 * score-preview assessment (live engine, varied bands).
 */
export async function loadStagingChartData(snapshotId?: string | null): Promise<ReadinessChartData> {
  if (snapshotId && snapshotId.trim()) {
    try {
      return await fetchChartDataFromSnapshot(snapshotId.trim());
    } catch {
      // Fall through to preview so the staging page still renders.
    }
  }
  return fetchStagingChartPreview();
}
