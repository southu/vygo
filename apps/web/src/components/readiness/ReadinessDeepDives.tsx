import type { ChartDimension } from "@/components/charts/types";
import { clampScore, SCORE_BAND_META, scoreBand } from "@/components/charts/scoreBands";
import { dimensionSectionId, dimensionSlug } from "@/lib/readiness/dimension-slug";
import type { DimensionRisk } from "@/lib/readiness/report-chart-data";

type ReadinessDeepDivesProps = {
  dimensions: ChartDimension[];
  riskMap: DimensionRisk[];
  className?: string;
};

/**
 * Server-rendered deep-dive section for each radar dimension. Each section owns
 * a stable `dimension-<slug>` anchor id so the client radar can smooth-scroll to
 * it, and `scroll-mt-24` keeps the heading clear of the sticky site header after
 * the scroll lands. Rendered on the server so the anchors are present in the
 * served HTML (acceptance criteria 2 + 4).
 */
export function ReadinessDeepDives({ dimensions, riskMap, className }: ReadinessDeepDivesProps) {
  if (dimensions.length === 0) return null;
  const riskByDimension = new Map(riskMap.map((r) => [r.dimension, r]));

  return (
    <section className={`section-pad pt-0 ${className ?? ""}`} data-testid="readiness-deep-dives">
      <div className="container-page max-w-2xl space-y-10">
        <div>
          <p className="eyebrow">Deep dive</p>
          <h2 className="mt-3 font-display text-2xl font-bold tracking-tight">
            Dimension deep dives
          </h2>
          <p className="mt-3 text-sm text-muted">
            Click any dimension on the radar above to jump straight to its breakdown.
          </p>
        </div>

        {dimensions.map((dim) => {
          const score = Math.round(clampScore(dim.score));
          const meta = SCORE_BAND_META[scoreBand(score)];
          const risk = riskByDimension.get(dim.dimension);
          const slug = dimensionSlug(dim.dimension);
          const headingId = `deep-dive-heading-${slug}`;
          return (
            <section
              key={slug}
              id={dimensionSectionId(dim.dimension)}
              className="readiness-deep-dive scroll-mt-24 border-t border-border pt-8"
              aria-labelledby={headingId}
              data-dimension={dim.dimension}
              data-testid={`readiness-deep-dive-${slug}`}
            >
              <header className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="eyebrow">Dimension</p>
                  <h3
                    id={headingId}
                    className="mt-1 font-display text-xl font-bold tracking-tight text-ink"
                  >
                    {dim.dimension}
                  </h3>
                  <span
                    className={`mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-canvas px-2.5 py-0.5 text-[11px] font-semibold ${meta.textClass}`}
                  >
                    {meta.label}
                  </span>
                </div>
                <p className="font-display text-3xl font-bold tabular-nums text-ink">
                  {score}
                  <span className="ml-1 text-base font-semibold text-muted">/100</span>
                </p>
              </header>

              <div
                className="mt-4 h-2.5 max-w-md overflow-hidden rounded-full bg-canvas"
                role="meter"
                aria-valuenow={score}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${dim.dimension} score`}
              >
                <div
                  className={`h-full rounded-full ${meta.barClass}`}
                  style={{ width: `${Math.max(score > 0 ? 4 : 0, score)}%` }}
                />
              </div>

              {risk && risk.reason.trim() ? (
                <div className="mt-4 max-w-prose rounded-2xl border border-border bg-canvas/60 px-5 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-red">
                    <span className="text-muted">Top critical risk: </span>
                    {risk.riskFactor}
                  </p>
                  <p className="mt-1.5 text-sm leading-snug text-ink-soft">{risk.reason}</p>
                </div>
              ) : null}

              {dim.sub_metrics.length > 0 ? (
                <ul className="mt-4 grid gap-2 sm:grid-cols-2" data-testid={`deep-dive-submetrics-${slug}`}>
                  {dim.sub_metrics.map((sm) => {
                    const smScore = Math.round(clampScore(sm.score));
                    const smMeta = SCORE_BAND_META[scoreBand(smScore)];
                    return (
                      <li
                        key={`${slug}-${sm.name}`}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                      >
                        <span className="min-w-0 truncate text-ink-soft">{sm.name}</span>
                        <span className={`shrink-0 tabular-nums font-semibold ${smMeta.textClass}`}>
                          {smScore}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </section>
          );
        })}
      </div>
    </section>
  );
}
