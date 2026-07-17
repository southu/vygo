"use client";

import { clampScore, scoreBand, SCORE_BAND_META, type ScoreBand } from "./scoreBands";
import type { ChartDimension } from "./types";

type SubMetricBarsProps = {
  dimensions: ChartDimension[];
  className?: string;
};

/**
 * Per-dimension horizontal sub-metric breakdowns with score-band coloring.
 * Each bar carries data-band="critical|warning|good" for machine verification.
 */
export function SubMetricBars({ dimensions, className }: SubMetricBarsProps) {
  return (
    <div
      className={className}
      data-testid="sub-metric-bars"
      data-chart="sub-metric-bars"
    >
      <div className="grid gap-5 lg:grid-cols-2">
        {dimensions.map((dim) => (
          <DimensionBars key={dim.dimension} dimension={dim} />
        ))}
      </div>
    </div>
  );
}

function DimensionBars({ dimension }: { dimension: ChartDimension }) {
  const dimBand = scoreBand(dimension.score);
  const dimMeta = SCORE_BAND_META[dimBand];
  const metrics =
    dimension.sub_metrics?.length > 0
      ? dimension.sub_metrics
      : [{ name: dimension.dimension, score: dimension.score }];

  return (
    <section
      className="card p-5 sm:p-6"
      data-testid={`sub-metric-dim-${slugify(dimension.dimension)}`}
      data-dimension={dimension.dimension}
      data-band={dimBand}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-bold text-ink">{dimension.dimension}</h3>
          <span
            className={`mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${dimMeta.textClass}`}
            style={{ background: dimMeta.softBg }}
            data-band={dimBand}
          >
            {dimMeta.label}
          </span>
        </div>
        <p className="font-display text-2xl font-bold tabular-nums text-ink">
          {Math.round(clampScore(dimension.score))}
          <span className="ml-1 text-sm font-semibold text-muted">/100</span>
        </p>
      </header>

      <ul className="space-y-3" role="list">
        {metrics.map((m, idx) => {
          const score = clampScore(m.score);
          const band = scoreBand(score);
          return (
            <SubMetricBarRow
              key={`${dimension.dimension}-${m.key ?? m.name}-${idx}`}
              name={m.name}
              score={score}
              band={band}
            />
          );
        })}
      </ul>
    </section>
  );
}

function SubMetricBarRow({
  name,
  score,
  band,
}: {
  name: string;
  score: number;
  band: ScoreBand;
}) {
  const meta = SCORE_BAND_META[band];
  const width = Math.max(score > 0 ? 3 : 0, score);

  return (
    <li
      className={`readiness-bar-row score-band-${band}`}
      data-band={band}
      data-score={Math.round(score)}
      data-testid={`sub-metric-bar-${slugify(name)}`}
    >
      <div className="mb-1 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-ink-soft">{name}</p>
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-xs tabular-nums text-muted">{Math.round(score)}</span>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.textClass}`}
            style={{ background: meta.softBg }}
            data-band={band}
          >
            {meta.label}
          </span>
        </div>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-canvas"
        role="meter"
        aria-valuenow={Math.round(score)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${name}: ${Math.round(score)}, ${meta.label}`}
        data-band={band}
      >
        <div
          className={`readiness-bar-fill h-full rounded-full ${meta.barClass} score-band-${band}`}
          data-band={band}
          style={{ width: `${width}%` }}
        />
      </div>
    </li>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
