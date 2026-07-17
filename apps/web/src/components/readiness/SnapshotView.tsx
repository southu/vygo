"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { readinessContent } from "@/content/readiness";
import { trackAnalytics } from "@/lib/analytics";
import {
  emailReadinessSnapshot,
  getReadinessSnapshot,
  type SnapshotDimensionAnalysis,
  type SnapshotDimensionDetail,
  type SnapshotRecommendation,
  type SnapshotResponse,
  type SnapshotSubMetricStatus,
} from "@/lib/readiness/api";

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
  if (score >= 70) return "strong";
  if (score >= 55) return "adequate";
  return "at_risk";
}

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, value));
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

/** Circular gauge for the overall readiness score (pure SVG, no canvas). */
function ScoreRing({ value, caption }: { value: number; caption: string }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const pct = clampPct(value);
  const filled = (pct / 100) * circumference;
  return (
    <div
      className="relative h-40 w-40 shrink-0"
      role="img"
      aria-label={`Overall readiness score ${Math.round(pct)} out of 100`}
      data-testid="snapshot-overall"
    >
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <defs>
          <linearGradient id="snapshot-ring-fill" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--color-purple)" />
            <stop offset="100%" stopColor="var(--color-purple-dark)" />
          </linearGradient>
        </defs>
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="var(--color-purple-soft)"
          strokeWidth="10"
        />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="url(#snapshot-ring-fill)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-4xl font-bold leading-none text-ink">
          {Math.round(pct)}
        </span>
        <span className="mt-1 text-xs font-medium uppercase tracking-[0.08em] text-muted">
          {caption}
        </span>
      </div>
    </div>
  );
}

/** One nested sub-metric check row: label, status pill, meter, and evidence reason. */
function CheckRow({
  dimension,
  check,
}: {
  dimension: string;
  check: SnapshotDimensionDetail["checks"][number];
}) {
  const status = check.answered ? check.status : "unknown";
  const meta = STATUS_META[status];
  const width = status === "unknown" ? 0 : clampPct(check.score);
  const reason =
    check.evidence && typeof check.evidence.reason === "string" ? check.evidence.reason : null;
  return (
    <li className="py-2.5" data-testid={`snapshot-check-${dimension}-${check.key}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-ink-soft">{check.label}</p>
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-xs tabular-nums text-muted">
            {status === "unknown" ? "—" : Math.round(check.score)}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.pill}`}
          >
            {meta.label}
          </span>
        </div>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-canvas">
        <div
          className={`h-full rounded-full ${meta.bar}`}
          style={{ width: `${Math.max(width > 0 ? 3 : 0, width)}%` }}
          aria-hidden
        />
      </div>
      {reason ? (
        <p
          className="mt-1.5 text-xs leading-snug text-muted"
          data-testid={`snapshot-check-reason-${dimension}-${check.key}`}
        >
          {reason}
        </p>
      ) : null}
    </li>
  );
}

/** Elevated per-dimension scorecard: headline score, progress bar, nested checks. */
function DimensionCard({
  dimension,
  point,
  range,
  showRange,
  detail,
  analysis,
}: {
  dimension: string;
  point: number;
  range?: { low: number; high: number; mid: number } | null;
  showRange: boolean;
  detail?: SnapshotDimensionDetail | null;
  analysis?: SnapshotDimensionAnalysis | null;
}) {
  const headline = showRange && range ? range.mid : point;
  const status = statusForScore(headline);
  const meta = STATUS_META[status];
  const analysisParagraphs =
    analysis?.paragraphs?.filter((p) => typeof p === "string" && p.trim()) ??
    (analysis?.analysis
      ? analysis.analysis
          .split(/\n\n+/)
          .map((p) => p.trim())
          .filter(Boolean)
      : []);
  return (
    <article className="card flex flex-col p-5 sm:p-6" data-testid={`snapshot-dim-${dimension}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-bold text-ink">{dimension}</h3>
          <span
            className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.pill}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden />
            {meta.label}
          </span>
        </div>
        <p className="font-display text-2xl font-bold tabular-nums text-ink">
          {showRange && range ? (
            <span data-testid={`snapshot-dim-score-${dimension}`}>
              {range.low}–{range.high}
            </span>
          ) : (
            <span data-testid={`snapshot-dim-score-${dimension}`}>{Math.round(point)}</span>
          )}
          <span className="ml-1 text-sm font-semibold text-muted">/100</span>
        </p>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-canvas">
        <div
          className="h-full rounded-full bg-purple"
          style={{ width: `${Math.max(4, clampPct(headline))}%` }}
          aria-hidden
        />
      </div>
      {analysisParagraphs.length >= 2 ? (
        <div
          className="mt-4 space-y-3 border-t border-border pt-4"
          data-testid={`snapshot-dim-analysis-${dimension}`}
        >
          {analysisParagraphs.map((para, idx) => (
            <p
              key={`${dimension}-analysis-${idx}`}
              className="text-sm leading-relaxed text-ink-soft"
              data-testid={`snapshot-dim-analysis-p-${dimension}-${idx}`}
            >
              {para}
            </p>
          ))}
        </div>
      ) : null}
      {detail && detail.checks.length > 0 ? (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
            Sub-metric checks
          </p>
          <ul
            className="mt-1 divide-y divide-border/60"
            data-testid={`snapshot-checks-${dimension}`}
          >
            {detail.checks.map((check) => (
              <CheckRow key={check.key} dimension={dimension} check={check} />
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

function SummaryStat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl border border-border bg-canvas px-4 py-3">
      <p className={`font-display text-xl font-bold tabular-nums ${accent}`}>{value}</p>
      <p className="mt-0.5 text-xs font-medium text-muted">{label}</p>
    </div>
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
    if (typeof data?.overall === "number" && Number.isFinite(data.overall)) return data.overall;
    if (!scores) return null;
    const values = DIMENSIONS.map((dim) => scores[dim]).filter(
      (v): v is number => typeof v === "number" && Number.isFinite(v),
    );
    if (!values.length) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }, [data?.overall, scores]);

  const checkStats = useMemo(() => {
    const details = data?.dimensionDetails;
    if (!details) return null;
    const checks = Object.values(details).flatMap((d) => d.checks);
    if (!checks.length) return null;
    const answered = checks.filter((ch) => ch.answered && ch.status !== "unknown");
    return {
      total: checks.length,
      strong: answered.filter((ch) => ch.status === "strong").length,
      atRisk: answered.filter((ch) => ch.status === "at_risk").length,
    };
  }, [data?.dimensionDetails]);

  const analysesByDim = useMemo(() => {
    const map = new Map<string, SnapshotDimensionAnalysis>();
    for (const a of data?.dimensionAnalyses ?? []) {
      if (a?.dimension) map.set(a.dimension, a);
    }
    return map;
  }, [data?.dimensionAnalyses]);

  if (loading) {
    return (
      <div className="mt-8 space-y-6" aria-busy="true" data-testid="snapshot-loading">
        <div className="card animate-pulse">
          <div className="h-4 w-40 rounded bg-canvas" />
          <div className="mt-4 h-32 w-32 rounded-full bg-canvas" />
        </div>
        <div className="card animate-pulse">
          <div className="h-4 w-56 rounded bg-canvas" />
          <div className="mt-4 h-2.5 rounded-full bg-canvas" />
          <div className="mt-3 h-2.5 rounded-full bg-canvas" />
          <div className="mt-3 h-2.5 rounded-full bg-canvas" />
        </div>
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

  const findings = (data.findings || []).slice(0, 3);
  const recommendation: SnapshotRecommendation | null = data.recommendation ?? null;
  const engagementName =
    recommendation?.engagement || data.recommendedEngagement || data.bucket || "Launch";

  return (
    <div className="mt-8 space-y-8" data-testid="readiness-snapshot">
      <header>
        <p className="eyebrow">{c.eyebrow}</p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          {c.title}
        </h1>
      </header>

      <section className="card p-6 sm:p-8" aria-labelledby="overview-heading">
        <h2 id="overview-heading" className="sr-only">
          Overall readiness
        </h2>
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:gap-10">
          {overallScore !== null ? <ScoreRing value={overallScore} caption="Overall" /> : null}
          <div className="min-w-0 flex-1">
            {data.bucket ? (
              <p className="text-base text-ink-soft" data-testid="snapshot-bucket">
                Recommended path:{" "}
                <span className="font-display text-lg font-bold text-purple">{data.bucket}</span>
              </p>
            ) : null}
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {data.displayMode === "range"
                ? "Manual entry — indicative score ranges (not single point scores)."
                : "Weighted blend of five dimensions, each scored 0–100 from nested sub-metric checks."}
            </p>
            {checkStats ? (
              <div className="mt-5 grid grid-cols-3 gap-3" data-testid="snapshot-check-stats">
                <SummaryStat
                  label="Checks evaluated"
                  value={String(checkStats.total)}
                  accent="text-ink"
                />
                <SummaryStat
                  label="Strong areas"
                  value={String(checkStats.strong)}
                  accent="text-green-dark"
                />
                <SummaryStat
                  label="Needs attention"
                  value={String(checkStats.atRisk)}
                  accent={checkStats.atRisk > 0 ? "text-red" : "text-ink"}
                />
              </div>
            ) : null}
          </div>
        </div>
        {data.caveat ? (
          <p
            className="mt-6 rounded-xl border border-border bg-canvas px-4 py-3 text-sm text-ink-soft"
            data-testid="snapshot-caveat"
          >
            {data.caveat}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="scorecard-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="scorecard-heading" className="font-display text-xl font-bold text-ink">
            Five-dimension scorecard
          </h2>
          <p className="text-sm text-muted">
            {data.displayMode === "range"
              ? "Indicative ranges per dimension."
              : "Scores 0–100 per dimension, with nested sub-metric checks."}
          </p>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-1 lg:grid-cols-2" data-testid="snapshot-scorecard">
          {DIMENSIONS.map((dim) => (
            <DimensionCard
              key={dim}
              dimension={dim}
              point={scores?.[dim] ?? 0}
              range={data.ranges?.[dim] ?? null}
              showRange={data.displayMode === "range" && Boolean(data.ranges?.[dim])}
              detail={data.dimensionDetails?.[dim] ?? null}
              analysis={analysesByDim.get(dim) ?? null}
            />
          ))}
        </div>
      </section>

      <section
        className="card p-6 sm:p-8"
        aria-labelledby="engagement-heading"
        data-testid="snapshot-engagement"
      >
        <h2 id="engagement-heading" className="font-display text-xl font-bold text-ink">
          {c.recommendedLabel}
        </h2>
        <p
          className="mt-2 font-display text-lg font-bold text-purple"
          data-testid="snapshot-engagement-name"
        >
          {engagementName}
        </p>
        {recommendation ? (
          <div className="mt-4 space-y-4" data-testid="snapshot-recommendation-detail">
            <div data-testid="snapshot-recommendation-rationale">
              <h3 className="text-sm font-semibold text-ink">Why this engagement</h3>
              <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-soft">
                {recommendation.rationale}
              </p>
            </div>
            {recommendation.citedFindings.length > 0 ? (
              <div data-testid="snapshot-recommendation-findings">
                <h3 className="text-sm font-semibold text-ink">Findings cited from your submission</h3>
                <ul className="mt-2 space-y-2 text-sm text-ink-soft">
                  {recommendation.citedFindings.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-3"
                      data-testid="snapshot-recommendation-finding"
                    >
                      <span
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-purple"
                        aria-hidden
                      />
                      <span className="leading-relaxed">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {recommendation.expectedOutcomes ? (
              <div data-testid="snapshot-recommendation-outcomes">
                <h3 className="text-sm font-semibold text-ink">Expected outcomes</h3>
                <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-soft">
                  {recommendation.expectedOutcomes}
                </p>
              </div>
            ) : null}
            {recommendation.firstStepScope ? (
              <div data-testid="snapshot-recommendation-first-step">
                <h3 className="text-sm font-semibold text-ink">Suggested first-step scope of work</h3>
                <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-soft">
                  {recommendation.firstStepScope}
                </p>
              </div>
            ) : null}
            {/* Full body also present for page-source / tester consumers */}
            <div className="sr-only" data-testid="snapshot-recommendation-body">
              {recommendation.body}
            </div>
          </div>
        ) : data.reasoning ? (
          <p
            className="mt-3 max-w-prose text-sm leading-relaxed text-ink-soft"
            data-testid="snapshot-reasoning"
          >
            {data.reasoning}
          </p>
        ) : null}
        {data.reasoning && recommendation ? (
          <p
            className="mt-4 max-w-prose border-t border-border pt-4 text-sm leading-relaxed text-muted"
            data-testid="snapshot-reasoning"
          >
            {data.reasoning}
          </p>
        ) : null}
      </section>

      <section
        className="card p-6 sm:p-8"
        aria-labelledby="findings-heading"
        data-testid="snapshot-findings"
      >
        <h2 id="findings-heading" className="font-display text-xl font-bold text-ink">
          {c.findingsLabel}
        </h2>
        <ul className="mt-4 space-y-3 text-sm text-ink-soft">
          {findings.map((f) => (
            <li key={f} className="flex items-start gap-3" data-testid="snapshot-finding">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-purple" aria-hidden />
              <span className="leading-relaxed">{f}</span>
            </li>
          ))}
        </ul>
      </section>

      <section
        className="card p-6 sm:p-8"
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link
          href={applyHref}
          className="btn-primary inline-flex justify-center"
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
          className="btn-secondary"
          onClick={() => void onEmailCopy()}
          disabled={emailStatus === "sending"}
          data-testid="snapshot-email-copy"
        >
          {emailStatus === "sending" ? c.emailSending : c.emailCopy}
        </button>
      </div>
      {emailFeedback ? (
        <p
          className={`text-sm ${emailStatus === "success" ? "text-ink-soft" : "text-red"}`}
          data-testid="snapshot-email-feedback"
          role="status"
        >
          {emailFeedback}
        </p>
      ) : null}
    </div>
  );
}
