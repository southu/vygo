import type { ChartDimension, ChartSubMetric } from "@/components/charts/types";
import { clampScore, scoreSeverity } from "@/lib/readiness/severity";
import { microCtaForPillar } from "@/lib/readiness/micro-cta";
import { dimensionSectionId, dimensionSlug } from "@/lib/readiness/dimension-slug";
import type { DimensionRisk } from "@/lib/readiness/report-chart-data";
import {
  EvidenceStripDisclosure,
  WrittenAnalysisDisclosure,
  type EvidenceRow,
} from "@/components/readiness/DeepDiveDisclosures";

type ReadinessDeepDivesProps = {
  dimensions: ChartDimension[];
  riskMap: DimensionRisk[];
  className?: string;
};

/** Normalize an evidence answer_value (string | number | array) to clean text. */
function answerText(value: unknown, max = 160): string {
  if (value == null) return "";
  const raw = Array.isArray(value)
    ? value
        .map((v) => (typeof v === "string" || typeof v === "number" ? String(v) : ""))
        .filter(Boolean)
        .join(", ")
    : typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : "";
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t || /^(nan|undefined|null)$/i.test(t)) return "";
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/** Lowest-scoring sub-metric that carries a verbatim reported answer. */
function lowestWithAnswer(subs: ChartSubMetric[]): ChartSubMetric | null {
  const withAnswer = subs
    .filter((sm) => sm.name && answerText(sm.evidence?.answer_value).length > 0)
    .slice()
    .sort((a, b) => a.score - b.score);
  return withAnswer[0] ?? null;
}

/**
 * Two synthesized analysis paragraphs for a dimension, grounded in the
 * build-time self-assessment scores + sub-metric answers (never generic copy).
 */
function analysisParagraphs(dim: ChartDimension, score: number, tierLabel: string): string[] {
  const lead = `On ${dim.dimension}, the aggregate readiness score is ${score}/100 (${tierLabel.toLowerCase()} tier). This reflects the sub-metric checks from the build-time self-assessment rather than a generic maturity label.`;
  const keyed = dim.sub_metrics
    .filter((sm) => sm.name)
    .slice()
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);
  const detail = keyed.length
    ? `Lowest-scoring checks include ${keyed
        .map((sm) => {
          const ans = answerText(sm.evidence?.answer_value, 60);
          const s = Math.round(clampScore(sm.score));
          return ans ? `${sm.name} (${s}/100; “${ans}”)` : `${sm.name} (${s}/100)`;
        })
        .join("; ")}.`
    : `Sub-metric detail for ${dim.dimension} was limited in this assessment; treat the dimension score as the primary signal.`;
  return [lead, detail];
}

/** One Evidence Strip row per dimension that has a quotable reported answer. */
function buildEvidenceRows(dimensions: ChartDimension[]): EvidenceRow[] {
  const rows: EvidenceRow[] = [];
  for (const dim of dimensions) {
    const sm = lowestWithAnswer(dim.sub_metrics);
    if (!sm) continue;
    rows.push({
      dimension: dim.dimension,
      riskFactor: sm.name,
      score: Math.round(clampScore(sm.score)),
      answer: answerText(sm.evidence?.answer_value, 200),
    });
  }
  return rows;
}

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
  const evidenceRows = buildEvidenceRows(dimensions);

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

        <EvidenceStripDisclosure rows={evidenceRows} />

        {dimensions.map((dim) => {
          const score = Math.round(clampScore(dim.score));
          const sev = scoreSeverity(score);
          const SevIcon = sev.Icon;
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
              data-severity-tier={sev.tier}
              data-score={score}
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
                    className={`mt-2 inline-flex items-center gap-1.5 rounded-full border bg-canvas px-2.5 py-0.5 text-[11px] font-semibold ${sev.borderClass} ${sev.textClass}`}
                  >
                    <SevIcon className="h-3.5 w-3.5" />
                    {sev.label}
                  </span>
                </div>
                <p className={`font-display text-3xl font-bold tabular-nums ${sev.textClass}`}>
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
                  className={`h-full rounded-full ${sev.barClass}`}
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

              <WrittenAnalysisDisclosure
                dimension={dim.dimension}
                slug={slug}
                paragraphs={analysisParagraphs(dim, score, sev.label)}
              />

              {dim.sub_metrics.length > 0 ? (
                <ul
                  className="mt-4 grid gap-2 sm:grid-cols-2"
                  data-testid={`deep-dive-submetrics-${slug}`}
                >
                  {dim.sub_metrics.map((sm) => {
                    const smScore = Math.round(clampScore(sm.score));
                    const smSev = scoreSeverity(smScore);
                    const SmIcon = smSev.Icon;
                    // Reuse the SAME tier that styles this sub-metric to decide the
                    // CTA — Good resolves to null, so no CTA renders there.
                    const cta = microCtaForPillar(dim.dimension, smSev.tier);
                    return (
                      <li
                        key={`${slug}-${sm.name}`}
                        className={`flex flex-col rounded-xl border bg-surface text-sm ${smSev.borderClass}`}
                        data-severity-tier={smSev.tier}
                        data-score={smScore}
                      >
                        <div className="flex items-center justify-between gap-3 px-3 py-2">
                          <span className="min-w-0 truncate text-ink-soft">{sm.name}</span>
                          <span
                            className={`flex shrink-0 items-center gap-1 tabular-nums font-semibold ${smSev.textClass}`}
                          >
                            <SmIcon className="h-3.5 w-3.5" />
                            {smScore}
                          </span>
                        </div>
                        {cta ? (
                          <div
                            className={`flex flex-col items-start gap-1.5 rounded-b-xl border-t px-3 py-2 ${smSev.borderClass} ${smSev.softBgClass}`}
                            data-testid="submetric-micro-cta"
                            data-pillar={dim.dimension}
                            data-package={cta.packageName}
                          >
                            <p className={`text-[11px] leading-snug ${smSev.textClass}`}>
                              {cta.painPoint}
                            </p>
                            <a
                              href={cta.href}
                              data-testid="submetric-micro-cta-link"
                              data-cta-tier={cta.packageId}
                              className={`inline-flex w-fit items-center rounded-md border bg-canvas px-2 py-1 text-[11px] font-semibold transition-colors hover:bg-surface ${smSev.borderClass} ${smSev.textClass}`}
                            >
                              {cta.ctaLabel}
                            </a>
                          </div>
                        ) : null}
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
