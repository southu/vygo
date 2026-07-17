"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { readinessContent } from "@/content/readiness";
import { trackAnalytics } from "@/lib/analytics";
import {
  emailReadinessSnapshot,
  getReadinessSnapshot,
  type SnapshotDimensionAnalysis,
  type SnapshotInsight,
  type SnapshotInsightType,
  type SnapshotRecommendation,
  type SnapshotResponse,
  type SnapshotSubMetricStatus,
} from "@/lib/readiness/api";
import {
  ChartSkeleton,
  ReadinessGauge,
  ReadinessRadarChart,
  SubMetricBars,
  clampScore,
} from "@/components/charts";
import type { ChartDimension } from "@/components/charts/types";
import { chartDataFromSnapshot } from "@/lib/readiness/chart-data";

const DIMENSIONS = [
  "Security",
  "Reliability",
  "Operability",
  "Maintainability",
  "Compliance posture",
] as const;

const DEFAULT_PRICING = {
  harden: "Harden $9,500 fixed",
  launch: "Launch from $75K",
  scale: "Scale from $145K",
  enterprise: "Enterprise $275K+",
  auditNote: "The audit locks scope and price and the $15K audit is credited toward the build.",
};

const INSIGHT_META: Record<
  SnapshotInsightType,
  { label: string; pill: string; border: string; accent: string }
> = {
  strength: {
    label: "Strength",
    pill: "bg-[#e7f5ee] text-green-dark",
    border: "border-green/30",
    accent: "bg-green",
  },
  risk: {
    label: "Risk",
    pill: "bg-[#fbebe9] text-red",
    border: "border-red/25",
    accent: "bg-red",
  },
  opportunity: {
    label: "Opportunity",
    pill: "bg-[#f0edff] text-purple-dark",
    border: "border-purple/25",
    accent: "bg-purple",
  },
};

const STATUS_META: Record<
  SnapshotSubMetricStatus,
  { label: string; pill: string; bar: string; dot: string }
> = {
  strong: {
    label: "Strong",
    pill: "bg-[#e7f5ee] text-green-dark",
    bar: "bg-green",
    dot: "bg-green",
  },
  adequate: {
    label: "Adequate",
    pill: "bg-[#fdf3e4] text-amber",
    bar: "bg-amber",
    dot: "bg-amber",
  },
  at_risk: {
    label: "At risk",
    pill: "bg-[#fbebe9] text-red",
    bar: "bg-red",
    dot: "bg-red",
  },
  unknown: {
    label: "Not assessed",
    pill: "bg-canvas text-muted",
    bar: "bg-border",
    dot: "bg-border",
  },
};

function statusForScore(score: number): SnapshotSubMetricStatus {
  if (!Number.isFinite(score)) return "unknown";
  if (score >= 70) return "strong";
  if (score >= 55) return "adequate";
  return "at_risk";
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

/** Format a finite 0–100 score for display; never emits NaN/undefined/null. */
function formatScore(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return String(Math.round(clampScore(value)));
}

function quoteText(value: unknown, max = 160): string {
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
  if (!t) return "";
  // Never surface the string forms of invalid scores as "quotes".
  if (/^(nan|undefined|null)$/i.test(t)) return "";
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * True when the snapshot has at least one finite numeric score we can render.
 * Missing / non-finite scores are a scoring failure — not a silent zero.
 */
function hasRenderableScores(data: SnapshotResponse): boolean {
  if (typeof data.overall === "number" && Number.isFinite(data.overall)) return true;
  const scores = data.dimensions ?? data.scores ?? null;
  if (!scores || typeof scores !== "object") return false;
  return DIMENSIONS.some((dim) => {
    const v = scores[dim];
    return typeof v === "number" && Number.isFinite(v);
  });
}

/** Max length for hero verdict / summary prose surfaces (layout-safe). */
const VERDICT_MAX_CHARS = 320;
/** Max length for full reasoning blocks on the results page. */
const REASONING_DISPLAY_MAX_CHARS = 720;

function firstSentence(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const match = cleaned.match(/^(.+?[.!?])(?:\s|$)/);
  const sentence = match?.[1];
  return sentence ? sentence.trim() : cleaned;
}

/**
 * One-line personalized verdict grounded in this submission (score, bucket,
 * report summary, or reasoning). Never generic placeholder copy.
 * Always length-bounded so long free-text never overflows the hero.
 */
function buildPersonalizedVerdict(data: SnapshotResponse, overall: number | null): string {
  const reasoningLine = data.reasoning ? firstSentence(data.reasoning) : "";
  if (reasoningLine && reasoningLine.length >= 40) {
    return quoteText(reasoningLine, VERDICT_MAX_CHARS) || quoteText(data.reasoning, VERDICT_MAX_CHARS);
  }

  const summary = quoteText(data.reportSummary?.summary, 90);
  const scoreBit =
    overall !== null && Number.isFinite(overall)
      ? `Overall readiness scored ${Math.round(overall)}/100`
      : "Your readiness snapshot is ready";
  const bucketBit = data.bucket ? `Recommended path: ${data.bucket}` : "";
  if (summary) {
    return quoteText(
      [scoreBit, `for “${summary}”`, bucketBit].filter(Boolean).join(" — ") + ".",
      VERDICT_MAX_CHARS,
    );
  }
  if (data.findings[0]) {
    return quoteText(
      `${scoreBit}. Top signal from your submission: ${quoteText(data.findings[0], 120)}.`,
      VERDICT_MAX_CHARS,
    );
  }
  return quoteText([scoreBit, bucketBit].filter(Boolean).join(". ") + ".", VERDICT_MAX_CHARS);
}

type SnapshotViewProps = {
  snapshotId: string;
};

function buildApplyHref(snapshot: SnapshotResponse): string {
  const offer = snapshot.offerKey === "harden" ? "harden" : snapshot.offerKey || "audit";
  const params = new URLSearchParams();
  params.set("offer", offer);
  if (snapshot.contact?.name) params.set("name", snapshot.contact.name);
  if (snapshot.contact?.email) params.set("email", snapshot.contact.email);
  if (snapshot.contact?.company) params.set("company", snapshot.contact.company);
  return `/waitlist?${params.toString()}`;
}

function dimSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/**
 * Build insight cards from API insights only.
 * Sparse degrade: when structured insights are empty, render fewer/zero callouts —
 * never synthesize a padded grid of template "leaves room to harden" cards.
 * Never render empty-quote callouts.
 */
function resolveInsightCards(data: SnapshotResponse): SnapshotInsight[] {
  return (data.insights ?? [])
    .filter(
      (i) =>
        Boolean(i.headline?.trim()) &&
        Boolean(i.source_answer?.trim()) &&
        Boolean(i.detail?.trim() || i.source_answer?.trim()),
    )
    .map((i) => ({
      ...i,
      headline: quoteText(i.headline, 160) || i.headline.trim(),
      detail: quoteText(i.detail, 480),
      source_answer: quoteText(i.source_answer, 180),
    }))
    .filter((i) => i.source_answer.length > 0)
    .slice(0, 9);
}

function InsightCard({ insight }: { insight: SnapshotInsight }) {
  const meta = INSIGHT_META[insight.type] ?? INSIGHT_META.opportunity;
  const quote = quoteText(insight.source_answer, 180);
  // Never render a card whose only "quote" would be empty / whitespace.
  if (!quote) return null;
  return (
    <article
      className={`relative overflow-hidden rounded-2xl border bg-surface p-5 shadow-card ${meta.border}`}
      data-testid={`snapshot-insight-${insight.type}`}
      data-insight-type={insight.type}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${meta.accent}`} aria-hidden />
      <div className="min-w-0 pl-2">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] ${meta.pill}`}
        >
          {meta.label}
        </span>
        {insight.dimension ? (
          <span className="ml-2 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
            {insight.dimension}
          </span>
        ) : null}
        <h3 className="mt-3 break-words font-display text-base font-bold leading-snug text-ink">
          {quoteText(insight.headline, 160) || insight.headline}
        </h3>
        {insight.detail ? (
          <p className="mt-2 break-words text-sm leading-relaxed text-ink-soft">
            {quoteText(insight.detail, 480)}
          </p>
        ) : null}
        <blockquote
          className="mt-3 break-words border-l-2 border-border pl-3 text-sm italic leading-relaxed text-ink"
          data-testid="snapshot-insight-quote"
        >
          “{quote}”
        </blockquote>
      </div>
    </article>
  );
}

/** Per-dimension report section: score, sub-metric bars, written analysis. */
function DimensionSection({
  dimension,
  point,
  range,
  showRange,
  chartDim,
  analysis,
}: {
  dimension: string;
  point: number;
  range?: { low: number; high: number; mid: number } | null;
  showRange: boolean;
  chartDim?: ChartDimension | null;
  analysis?: SnapshotDimensionAnalysis | null;
}) {
  const rawHeadline = showRange && range && Number.isFinite(range.mid) ? range.mid : point;
  const headline = Number.isFinite(rawHeadline) ? clampScore(rawHeadline) : null;
  const status = headline == null ? "unknown" : statusForScore(headline);
  const meta = STATUS_META[status];
  const analysisParagraphs =
    analysis?.paragraphs?.filter((p) => typeof p === "string" && p.trim()) ??
    (analysis?.analysis
      ? analysis.analysis
          .split(/\n\n+/)
          .map((p) => p.trim())
          .filter(Boolean)
      : []);

  const scoreLabel = headline == null ? null : formatScore(headline);
  // Guarantee non-empty analysis text for the section.
  const paragraphs =
    analysisParagraphs.length > 0
      ? analysisParagraphs.map((p) => quoteText(p, 800) || p)
      : [
          scoreLabel
            ? `On ${dimension}, your aggregate score is ${scoreLabel}/100 (${meta.label.toLowerCase()}). This section reflects the sub-metric checks from your submission rather than a generic maturity label.`
            : `On ${dimension}, a numeric score was not available for this snapshot. Re-run the assessment with complete answers for a scored dimension view.`,
          chartDim && chartDim.sub_metrics.length > 0
            ? `Key sub-metrics include ${chartDim.sub_metrics
                .slice(0, 3)
                .map((m) => {
                  const ans = quoteText(m.evidence?.answer_value, 60);
                  const sm = formatScore(m.score);
                  if (!sm) return ans ? `${m.name} (“${ans}”)` : m.name;
                  return ans ? `${m.name} (${sm}/100; “${ans}”)` : `${m.name} (${sm}/100)`;
                })
                .join("; ")}.`
            : `Sub-metric detail for ${dimension} was limited in this snapshot; treat the dimension score as the primary signal and re-run with a fuller diagnostic paste for deeper analysis.`,
        ];

  const barsPayload: ChartDimension[] = chartDim
    ? [
        {
          ...chartDim,
          score: headline ?? clampScore(chartDim.score),
          sub_metrics: chartDim.sub_metrics.map((m) => ({
            ...m,
            score: Number.isFinite(m.score) ? clampScore(m.score) : 0,
          })),
        },
      ]
    : [
        {
          dimension,
          score: headline ?? 0,
          sub_metrics: [],
          evidence: null,
        },
      ];

  const rangeLow = range && Number.isFinite(range.low) ? Math.round(range.low) : null;
  const rangeHigh = range && Number.isFinite(range.high) ? Math.round(range.high) : null;
  const showRangeDisplay = showRange && rangeLow != null && rangeHigh != null;
  const pointLabel = formatScore(point);

  return (
    <section
      className="readiness-report-dimension scroll-mt-24 space-y-5 border-t border-border pt-10"
      aria-labelledby={`dim-heading-${dimSlug(dimension)}`}
      data-testid={`snapshot-dim-${dimension}`}
      data-dimension={dimension}
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">Dimension</p>
          <h2
            id={`dim-heading-${dimSlug(dimension)}`}
            className="mt-1 font-display text-2xl font-bold tracking-tight text-ink"
          >
            {dimension}
          </h2>
          <span
            className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${meta.pill}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden />
            {meta.label}
          </span>
        </div>
        <p className="font-display text-3xl font-bold tabular-nums text-ink">
          {showRangeDisplay ? (
            <span data-testid={`snapshot-dim-score-${dimension}`}>
              {rangeLow}–{rangeHigh}
            </span>
          ) : (
            <span data-testid={`snapshot-dim-score-${dimension}`}>
              {pointLabel ?? "—"}
            </span>
          )}
          <span className="ml-1 text-base font-semibold text-muted">/100</span>
        </p>
      </header>

      <div
        className="h-2.5 max-w-md overflow-hidden rounded-full bg-canvas"
        role="meter"
        aria-valuenow={headline == null ? 0 : Math.round(clampPct(headline))}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${dimension} score`}
      >
        <div
          className={`h-full rounded-full ${meta.bar}`}
          style={{
            width:
              headline == null
                ? "0%"
                : `${Math.max(headline > 0 ? 4 : 0, clampPct(headline))}%`,
          }}
          data-testid={`snapshot-dim-bar-${dimension}`}
        />
      </div>

      <div data-testid={`snapshot-dim-submetrics-${dimension}`}>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-muted">
          Sub-metric bars
        </h3>
        <SubMetricBars dimensions={barsPayload} className="readiness-report-submetrics" />
      </div>

      <div
        className="max-w-prose space-y-4 rounded-2xl border border-border bg-canvas/60 px-5 py-5 sm:px-6"
        data-testid={`snapshot-dim-analysis-${dimension}`}
      >
        <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted">
          Written analysis
        </h3>
        {paragraphs.map((para, idx) => (
          <p
            key={`${dimension}-analysis-${idx}`}
            className="text-sm leading-relaxed text-ink-soft sm:text-[0.95rem]"
            data-testid={`snapshot-dim-analysis-p-${dimension}-${idx}`}
          >
            {para}
          </p>
        ))}
      </div>
    </section>
  );
}

export function SnapshotView({ snapshotId }: SnapshotViewProps) {
  const c = readinessContent.snapshot;
  const [data, setData] = useState<SnapshotResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [emailStatus, setEmailStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [emailFeedback, setEmailFeedback] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const snap = await getReadinessSnapshot(snapshotId);
        if (!cancelled) {
          setData(snap);
          if (snap.bucket) {
            trackAnalytics("bucket_assigned", { bucket: snap.bucket, source: "snapshot" });
          }
          trackAnalytics("stage_started", { stage: "snapshot" });
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : c.notFound);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [snapshotId, c.notFound]);

  const pricing = useMemo(() => {
    return {
      ...DEFAULT_PRICING,
      ...(data?.pricing ?? {}),
    };
  }, [data?.pricing]);

  const ctaLabel =
    data?.bucket === "Harden"
      ? "Start free Harden assessment"
      : data?.ctaLabel || "Apply for the next audit opening";

  const applyHref = data ? buildApplyHref({ ...data, ctaLabel }) : "/waitlist";

  const onEmailCopy = useCallback(async () => {
    if (!data || emailStatus === "sending") return;
    setEmailStatus("sending");
    setEmailFeedback("");
    try {
      await emailReadinessSnapshot({
        id: data.id,
        email: data.contact?.email || undefined,
      });
      setEmailStatus("success");
      setEmailFeedback(c.emailSuccess);
    } catch (err) {
      setEmailStatus("error");
      setEmailFeedback(err instanceof Error ? err.message : c.emailError);
    }
  }, [data, emailStatus, c.emailSuccess, c.emailError]);

  const scores = data?.dimensions ?? data?.scores ?? null;

  const overallScore = useMemo(() => {
    if (typeof data?.overall === "number" && Number.isFinite(data.overall)) {
      return clampScore(data.overall);
    }
    if (!scores) return null;
    const values = DIMENSIONS.map((dim) => scores[dim]).filter(
      (v): v is number => typeof v === "number" && Number.isFinite(v),
    );
    if (!values.length) return null;
    return clampScore(values.reduce((a, b) => a + b, 0) / values.length);
  }, [data?.overall, scores]);

  const analysesByDim = useMemo(() => {
    const map = new Map<string, SnapshotDimensionAnalysis>();
    for (const a of data?.dimensionAnalyses ?? []) {
      if (a?.dimension) map.set(a.dimension, a);
    }
    return map;
  }, [data?.dimensionAnalyses]);

  const chartData = useMemo(() => {
    if (!data) return null;
    try {
      return chartDataFromSnapshot(data);
    } catch {
      return null;
    }
  }, [data]);

  const chartDimByName = useMemo(() => {
    const map = new Map<string, ChartDimension>();
    for (const d of chartData?.dimensions ?? []) {
      map.set(d.dimension, d);
    }
    return map;
  }, [chartData]);

  const insights = useMemo(() => (data ? resolveInsightCards(data) : []), [data]);

  const scoringFailed = Boolean(data && !hasRenderableScores(data));

  const verdict = useMemo(
    () => (data && !scoringFailed ? buildPersonalizedVerdict(data, overallScore) : ""),
    [data, overallScore, scoringFailed],
  );

  if (loading) {
    // Mirror the hydrated report structure (hero / radar / insights / 5 dimensions)
    // with fixed min-heights so chart hydration does not jump body layout.
    return (
      <div
        className="readiness-report mt-6 space-y-12 sm:mt-8 sm:space-y-14"
        aria-busy="true"
        data-testid="snapshot-loading"
      >
        <section
          className="rounded-3xl border border-border bg-surface px-5 py-8 shadow-card sm:px-8 sm:py-10"
          data-testid="snapshot-loading-hero"
        >
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:gap-12">
            <div
              className="mx-auto w-full max-w-sm shrink-0 lg:mx-0"
              style={{ minHeight: 300 }}
              data-testid="snapshot-loading-gauge-slot"
            >
              <ChartSkeleton kind="gauge" label="Loading readiness gauge" />
            </div>
            <div className="min-w-0 flex-1 space-y-4">
              <div className="h-3 w-28 animate-pulse rounded bg-canvas" />
              <div className="h-8 w-3/4 max-w-md animate-pulse rounded bg-canvas" />
              <div className="h-16 w-full max-w-prose animate-pulse rounded bg-canvas" />
              <div className="h-4 w-40 animate-pulse rounded bg-canvas" />
            </div>
          </div>
        </section>
        <section data-testid="snapshot-loading-radar" className="space-y-4">
          <div className="max-w-prose space-y-2">
            <div className="h-3 w-24 animate-pulse rounded bg-canvas" />
            <div className="h-7 w-48 animate-pulse rounded bg-canvas" />
            <div className="h-4 w-full max-w-md animate-pulse rounded bg-canvas" />
          </div>
          <div
            className="mx-auto w-full max-w-xl rounded-3xl border border-border bg-surface p-4 shadow-card sm:p-6"
            style={{ minHeight: 400 }}
          >
            <ChartSkeleton kind="radar" label="Loading readiness radar" />
          </div>
        </section>
        <section data-testid="snapshot-loading-insights" className="space-y-5">
          <div className="max-w-prose space-y-2">
            <div className="h-3 w-28 animate-pulse rounded bg-canvas" />
            <div className="h-7 w-64 animate-pulse rounded bg-canvas" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-36 animate-pulse rounded-2xl border border-border bg-canvas"
                aria-hidden
              />
            ))}
          </div>
        </section>
        <section data-testid="snapshot-loading-bars" className="space-y-2">
          <div className="max-w-prose space-y-2 pb-2">
            <div className="h-3 w-20 animate-pulse rounded bg-canvas" />
            <div className="h-7 w-72 animate-pulse rounded bg-canvas" />
          </div>
          <div className="space-y-8">
            {Array.from({ length: 5 }).map((_, i) => (
              <ChartSkeleton
                key={i}
                kind="dimension"
                label={`Loading dimension ${i + 1}`}
                className="border-t border-border pt-6"
              />
            ))}
          </div>
        </section>
        <p className="text-sm text-muted">{c.loading}</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card mt-8 border-red/30" role="alert" data-testid="snapshot-error">
        <p className="font-semibold text-ink">{c.notFound}</p>
        <p className="mt-2 text-sm text-muted">{error}</p>
        <Link href="/readiness" className="btn-primary mt-4 inline-flex">
          Start a readiness check
        </Link>
      </div>
    );
  }

  // Scoring failure: never invent a silent fallback score (0 / NaN / undefined).
  if (scoringFailed) {
    return (
      <div
        className="card mt-8 border-red/30"
        role="alert"
        data-testid="snapshot-scoring-error"
        data-scoring-state="failed"
      >
        <p className="font-semibold text-ink">{c.scoringFailedTitle}</p>
        <p className="mt-2 text-sm text-muted" data-testid="snapshot-scoring-error-message">
          {c.scoringFailedBody}
        </p>
        <p className="mt-3 text-sm text-ink-soft">
          We could not compute a valid readiness score from this submission. No fallback score was
          substituted. Please re-run the assessment with complete answers.
        </p>
        <Link href="/readiness" className="btn-primary mt-4 inline-flex">
          Start a readiness check
        </Link>
      </div>
    );
  }

  const recommendation: SnapshotRecommendation | null = data.recommendation ?? null;
  const engagementName =
    recommendation?.engagement || data.recommendedEngagement || data.bucket || "Launch";

  const finiteDimScore = (dim: string): number | null => {
    const v = scores?.[dim];
    return typeof v === "number" && Number.isFinite(v) ? clampScore(v) : null;
  };

  const gaugeSegments =
    chartData?.dimensions.map((d) => ({
      label: d.dimension,
      score: Number.isFinite(d.score) ? clampScore(d.score) : 0,
      evidence: d.evidence,
    })) ??
    DIMENSIONS.map((dim) => ({
      label: dim,
      score: finiteDimScore(dim) ?? 0,
      evidence: null,
    }));

  const radarDimensions: ChartDimension[] =
    chartData?.dimensions && chartData.dimensions.length > 0
      ? chartData.dimensions.map((d) => ({
          ...d,
          score: Number.isFinite(d.score) ? clampScore(d.score) : 0,
        }))
      : DIMENSIONS.map((dim) => ({
          dimension: dim,
          score: finiteDimScore(dim) ?? 0,
          sub_metrics: [],
          evidence: null,
        }));

  return (
    <article
      className="readiness-report mt-6 space-y-12 sm:mt-8 sm:space-y-14"
      data-testid="readiness-snapshot"
      data-report-layout="consultant"
    >
      {/* ── 1. Hero: headline gauge + one-line personalized verdict ───────── */}
      <section
        className="readiness-report-hero min-w-0 overflow-hidden rounded-3xl border border-border bg-surface px-5 py-8 shadow-card sm:px-8 sm:py-10 lg:px-10"
        aria-labelledby="report-hero-heading"
        data-testid="snapshot-hero"
      >
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:gap-12">
          <div
            className="mx-auto w-full max-w-sm shrink-0 lg:mx-0"
            data-testid="snapshot-hero-gauge"
            style={{ minHeight: 300 }}
          >
            {overallScore !== null ? (
              <ReadinessGauge
                value={overallScore}
                label="Overall readiness"
                className="w-full"
                evidence={chartData?.overallEvidence}
                segments={gaugeSegments}
              />
            ) : (
              <div
                className="flex h-[300px] items-center justify-center rounded-2xl border border-border bg-canvas text-sm text-muted"
                data-testid="snapshot-score-unavailable"
              >
                Score unavailable
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 text-center lg:text-left">
            <p className="eyebrow">{c.eyebrow}</p>
            <h1
              id="report-hero-heading"
              className="mt-3 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl"
            >
              {c.title}
            </h1>
            <p
              className="mt-5 min-w-0 max-w-full break-words text-base font-medium leading-relaxed text-ink sm:text-lg"
              data-testid="snapshot-verdict"
              data-verdict="personalized"
            >
              {verdict}
            </p>
            {data.bucket ? (
              <p className="mt-4 min-w-0 break-words text-sm text-ink-soft" data-testid="snapshot-bucket">
                Recommended path:{" "}
                <span className="font-display text-base font-bold text-purple">{data.bucket}</span>
              </p>
            ) : null}
            {data.caveat ? (
              <p
                className="mt-5 min-w-0 max-w-full break-words rounded-xl border border-border bg-canvas px-4 py-3 text-left text-sm text-ink-soft"
                data-testid="snapshot-caveat"
              >
                {quoteText(data.caveat, 480)}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* ── 2. Readiness radar across dimensions ─────────────────────────── */}
      <section
        className="readiness-report-radar space-y-4"
        aria-labelledby="report-radar-heading"
        data-testid="snapshot-radar-section"
      >
        <div className="max-w-prose">
          <p className="eyebrow">Posture map</p>
          <h2
            id="report-radar-heading"
            className="mt-1 font-display text-2xl font-bold tracking-tight text-ink"
          >
            Readiness radar
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Five assessment dimensions on a single radial view. Each axis reflects scores from your
            submitted answers.
          </p>
        </div>
        <div
          className="mx-auto w-full max-w-xl rounded-3xl border border-border bg-surface p-4 shadow-card sm:p-6"
          data-testid="snapshot-chart-radar"
          data-chart="radar"
          style={{ minHeight: 400 }}
        >
          {radarDimensions.length > 0 ? (
            <ReadinessRadarChart dimensions={radarDimensions} />
          ) : (
            <ChartSkeleton kind="radar" label="Chart unavailable" />
          )}
        </div>
      </section>

      {/* ── 3. What we learned from your data ────────────────────────────── */}
      <section
        className="readiness-report-insights space-y-5"
        aria-labelledby="report-insights-heading"
        data-testid="snapshot-insights"
      >
        <div className="max-w-prose">
          <p className="eyebrow">Evidence strip</p>
          <h2
            id="report-insights-heading"
            className="mt-1 font-display text-2xl font-bold tracking-tight text-ink"
          >
            What we learned from your data
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Strengths, risks, and opportunities ranked from your own inputs — each card quotes what
            you actually entered.
          </p>
        </div>
        {insights.length > 0 ? (
          <div
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
            data-testid="snapshot-insight-cards"
          >
            {insights.map((insight, idx) => (
              <InsightCard key={`${insight.type}-${insight.headline}-${idx}`} insight={insight} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No structured insights were available for this snapshot.</p>
        )}
      </section>

      {/* ── 4. Per-dimension sections ────────────────────────────────────── */}
      <div className="readiness-report-dimensions space-y-2" data-testid="snapshot-dimensions">
        <div className="max-w-prose pb-2">
          <p className="eyebrow">Deep dive</p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">
            Dimension-by-dimension analysis
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Sub-metric bars and written analysis for each assessment dimension, grounded in your
            submission.
          </p>
        </div>
        {DIMENSIONS.map((dim) => {
          const point = finiteDimScore(dim);
          return (
            <DimensionSection
              key={dim}
              dimension={dim}
              point={point ?? Number.NaN}
              range={data.ranges?.[dim] ?? null}
              showRange={data.displayMode === "range" && Boolean(data.ranges?.[dim])}
              chartDim={chartDimByName.get(dim) ?? null}
              analysis={analysesByDim.get(dim) ?? null}
            />
          );
        })}
      </div>

      {/* ── 5. Detailed recommendation + CTA ─────────────────────────────── */}
      <section
        className="readiness-report-recommendation relative overflow-hidden rounded-3xl border-2 border-purple/40 bg-gradient-to-br from-[#1b1633] via-[#241d45] to-[#16141f] px-6 py-8 text-white shadow-card sm:px-8 sm:py-10"
        aria-labelledby="report-recommendation-heading"
        data-testid="snapshot-recommendation"
        data-section="detailed-recommendation"
      >
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-purple/30 blur-3xl"
          aria-hidden
        />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-green">
            Detailed recommendation
          </p>
          <h2
            id="report-recommendation-heading"
            className="mt-2 font-display text-2xl font-bold tracking-tight text-white sm:text-3xl"
          >
            {c.recommendedLabel}
          </h2>
          <p
            className="mt-3 font-display text-xl font-bold text-[#c4b5fd] sm:text-2xl"
            data-testid="snapshot-engagement-name"
          >
            {engagementName}
          </p>

          {recommendation ? (
            <div className="mt-6 space-y-5" data-testid="snapshot-recommendation-detail">
              <div data-testid="snapshot-recommendation-rationale">
                <h3 className="text-sm font-semibold text-white/90">Why this engagement</h3>
                <p className="mt-2 min-w-0 max-w-prose break-words text-sm leading-relaxed text-white/80">
                  {quoteText(recommendation.rationale, 800)}
                </p>
              </div>
              {recommendation.citedFindings.length > 0 ? (
                <div data-testid="snapshot-recommendation-findings">
                  <h3 className="text-sm font-semibold text-white/90">
                    Findings cited from your submission
                  </h3>
                  <ul className="mt-2 space-y-2 text-sm text-white/80">
                    {recommendation.citedFindings.map((f) => {
                      const finding = quoteText(f, 280);
                      if (!finding) return null;
                      return (
                      <li
                        key={finding}
                        className="flex min-w-0 items-start gap-3"
                        data-testid="snapshot-recommendation-finding"
                      >
                        <span
                          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green"
                          aria-hidden
                        />
                        <span className="min-w-0 break-words leading-relaxed">{finding}</span>
                      </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
              {recommendation.expectedOutcomes ? (
                <div data-testid="snapshot-recommendation-outcomes">
                  <h3 className="text-sm font-semibold text-white/90">Expected outcomes</h3>
                  <p className="mt-2 min-w-0 max-w-prose break-words text-sm leading-relaxed text-white/80">
                    {quoteText(recommendation.expectedOutcomes, 600)}
                  </p>
                </div>
              ) : null}
              {recommendation.firstStepScope ? (
                <div data-testid="snapshot-recommendation-first-step">
                  <h3 className="text-sm font-semibold text-white/90">
                    Suggested first-step scope of work
                  </h3>
                  <p className="mt-2 min-w-0 max-w-prose break-words text-sm leading-relaxed text-white/80">
                    {quoteText(recommendation.firstStepScope, 600)}
                  </p>
                </div>
              ) : null}
              <div className="sr-only" data-testid="snapshot-recommendation-body">
                {quoteText(recommendation.body, 1600)}
              </div>
            </div>
          ) : data.reasoning ? (
            <p
              className="mt-4 min-w-0 max-w-prose break-words text-sm leading-relaxed text-white/80"
              data-testid="snapshot-reasoning"
            >
              {quoteText(data.reasoning, REASONING_DISPLAY_MAX_CHARS)}
            </p>
          ) : null}

          {data.reasoning && recommendation ? (
            <p
              className="mt-5 min-w-0 max-w-prose break-words border-t border-white/15 pt-5 text-sm leading-relaxed text-white/65"
              data-testid="snapshot-reasoning"
            >
              {quoteText(data.reasoning, REASONING_DISPLAY_MAX_CHARS)}
            </p>
          ) : null}

          {/* CTA closes the recommendation section */}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href={applyHref}
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-green px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-dark"
              data-testid="snapshot-primary-cta"
              data-offer={data.offerKey || (data.bucket === "Harden" ? "harden" : "audit")}
              onClick={() =>
                trackAnalytics("cta_clicked", {
                  offer: data.offerKey || (data.bucket === "Harden" ? "harden" : "audit"),
                  bucket: data.bucket || "unknown",
                })
              }
            >
              {ctaLabel}
            </Link>
            <button
              type="button"
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/25 bg-transparent px-6 py-3 text-sm font-semibold text-white transition-colors hover:border-white/50"
              onClick={() => void onEmailCopy()}
              disabled={emailStatus === "sending"}
              data-testid="snapshot-email-copy"
            >
              {emailStatus === "sending" ? c.emailSending : c.emailCopy}
            </button>
          </div>
          {emailFeedback ? (
            <p
              className={`mt-3 text-sm ${emailStatus === "success" ? "text-white/80" : "text-red-200"}`}
              data-testid="snapshot-email-feedback"
              role="status"
            >
              {emailFeedback}
            </p>
          ) : null}
        </div>
      </section>

      {/* Indicative pricing (secondary, print-friendly) */}
      <section
        className="readiness-report-pricing rounded-2xl border border-border bg-surface p-6 sm:p-8"
        aria-labelledby="pricing-heading"
        data-testid="snapshot-pricing"
      >
        <h2 id="pricing-heading" className="font-display text-xl font-bold text-ink">
          {c.pricingLabel}
        </h2>
        <ul className="mt-4 grid gap-2 text-sm text-ink-soft sm:grid-cols-2">
          <li
            className="rounded-xl border border-border bg-canvas px-4 py-3"
            data-testid="pricing-harden"
          >
            {pricing.harden}
          </li>
          <li
            className="rounded-xl border border-border bg-canvas px-4 py-3"
            data-testid="pricing-launch"
          >
            {pricing.launch}
          </li>
          <li
            className="rounded-xl border border-border bg-canvas px-4 py-3"
            data-testid="pricing-scale"
          >
            {pricing.scale}
          </li>
          <li
            className="rounded-xl border border-border bg-canvas px-4 py-3"
            data-testid="pricing-enterprise"
          >
            {pricing.enterprise}
          </li>
        </ul>
        <p className="mt-4 text-sm font-medium text-ink" data-testid="pricing-audit-note">
          {pricing.auditNote}
        </p>
      </section>
    </article>
  );
}
