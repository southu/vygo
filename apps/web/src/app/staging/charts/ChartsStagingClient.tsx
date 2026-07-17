"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ReadinessGauge,
  ReadinessRadarChart,
  SubMetricBars,
  type ReadinessChartData,
} from "@/components/charts";
import { loadStagingChartData } from "@/lib/readiness/chart-data";

/**
 * Hidden staging surface for readiness chart components.
 * Loads LIVE data from a real snapshot (?id=) or the public score-preview
 * mixed assessment (same scoring engine as submissions).
 */
export function ChartsStagingClient() {
  const searchParams = useSearchParams();
  const snapshotId = searchParams.get("id");
  const [data, setData] = useState<ReadinessChartData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const next = await loadStagingChartData(snapshotId);
        if (!cancelled) {
          setData(next);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load chart data.");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [snapshotId]);

  if (loading) {
    return (
      <div className="card mt-6" aria-busy="true" data-testid="charts-staging-loading">
        <p className="text-sm text-muted">Loading live readiness chart data…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card mt-6 border-red/30" data-testid="charts-staging-error" role="alert">
        <p className="font-semibold text-ink">Could not load chart data</p>
        <p className="mt-1 text-sm text-muted">{error || "Unknown error"}</p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-8 readiness-charts-stage" data-testid="charts-staging-ready">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
        <span className="chip">Staging · not linked in nav</span>
        {data.sourceLabel ? <span data-testid="charts-source-label">{data.sourceLabel}</span> : null}
        {data.bucket ? (
          <span className="rounded-full bg-purple-soft px-2.5 py-0.5 font-semibold text-purple-dark">
            Bucket: {data.bucket}
          </span>
        ) : null}
      </div>

      <section
        className="card readiness-charts-enter p-5 sm:p-8"
        aria-labelledby="staging-headline-heading"
      >
        <p className="eyebrow">Headline score</p>
        <h2 id="staging-headline-heading" className="mt-1 font-display text-xl font-bold text-ink">
          Overall readiness gauge
        </h2>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Semicircular gauge of the blended readiness score with entrance animation.
        </p>
        <div className="mt-6 flex justify-center">
          <ReadinessGauge
            value={data.overall}
            className="w-full max-w-sm"
            evidence={data.overallEvidence}
            segments={data.dimensions.map((d) => ({
              label: d.dimension,
              score: d.score,
              evidence: d.evidence,
            }))}
          />
        </div>
      </section>

      <section
        className="card readiness-charts-enter readiness-charts-enter-delay p-5 sm:p-8"
        aria-labelledby="staging-radar-heading"
      >
        <p className="eyebrow">Multi-dimension posture</p>
        <h2 id="staging-radar-heading" className="mt-1 font-display text-xl font-bold text-ink">
          Readiness radar
        </h2>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Spider chart across every scored dimension (Security, Reliability, Operability,
          Maintainability, Compliance posture). Hover, tap, or focus an axis for evidence.
        </p>
        <div className="mx-auto mt-4 w-full max-w-lg px-1 sm:px-4">
          <ReadinessRadarChart dimensions={data.dimensions} />
        </div>
      </section>

      <section
        className="readiness-charts-enter readiness-charts-enter-delay-2"
        aria-labelledby="staging-bars-heading"
      >
        <div className="mb-4">
          <p className="eyebrow">Drill-down</p>
          <h2 id="staging-bars-heading" className="mt-1 font-display text-xl font-bold text-ink">
            Sub-metric breakdowns
          </h2>
          <p className="mt-2 max-w-prose text-sm text-muted">
            Horizontal bars per dimension check, banded critical / warning / good (
            <code className="text-xs">data-band</code>).
          </p>
        </div>
        <SubMetricBars dimensions={data.dimensions} />
      </section>
    </div>
  );
}
