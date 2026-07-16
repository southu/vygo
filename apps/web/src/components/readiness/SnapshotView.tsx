"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { readinessContent } from "@/content/readiness";
import {
  emailReadinessSnapshot,
  getReadinessSnapshot,
  type SnapshotResponse,
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

/** Five-dimension bar scorecard (on-brand, works without canvas). */
function DimensionBars({
  scores,
  ranges,
  displayMode,
}: {
  scores: Record<string, number> | null | undefined;
  ranges?: SnapshotResponse["ranges"];
  displayMode?: "point" | "range";
}) {
  return (
    <div className="space-y-4" data-testid="snapshot-scorecard">
      {DIMENSIONS.map((dim) => {
        const point = scores?.[dim] ?? 0;
        const range = ranges?.[dim];
        const showRange = displayMode === "range" && range;
        const width = showRange ? range.mid : point;
        return (
          <div key={dim} data-testid={`snapshot-dim-${dim}`}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold text-ink">{dim}</p>
              <p className="font-mono text-sm text-ink-soft">
                {showRange ? `${range.low}–${range.high}` : `${Math.round(point)}`}
              </p>
            </div>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-canvas">
              <div
                className="h-full rounded-full bg-purple"
                style={{ width: `${Math.max(4, Math.min(100, width))}%` }}
                aria-hidden
              />
            </div>
          </div>
        );
      })}
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

  if (loading) {
    return (
      <div className="card mt-8" aria-busy="true" data-testid="snapshot-loading">
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

  return (
    <div className="mt-8 space-y-6" data-testid="readiness-snapshot">
      <header>
        <p className="eyebrow">{c.eyebrow}</p>
        <h1 className="mt-3 font-display text-3xl font-bold text-ink sm:text-4xl">{c.title}</h1>
        {data.bucket ? (
          <p className="mt-3 text-base text-ink-soft" data-testid="snapshot-bucket">
            Recommended path: <span className="font-semibold text-ink">{data.bucket}</span>
          </p>
        ) : null}
        {data.caveat ? (
          <p
            className="mt-2 rounded-xl border border-border bg-canvas px-3 py-2 text-sm text-ink-soft"
            data-testid="snapshot-caveat"
          >
            {data.caveat}
          </p>
        ) : null}
      </header>

      <section className="card" aria-labelledby="scorecard-heading">
        <h2 id="scorecard-heading" className="font-display text-xl font-bold text-ink">
          Five-dimension scorecard
        </h2>
        <p className="mt-1 text-sm text-muted">
          {data.displayMode === "range"
            ? "Manual entry — indicative score ranges (not single point scores)."
            : "Scores 0–100 per dimension."}
        </p>
        <div className="mt-5">
          <DimensionBars
            scores={data.dimensions ?? data.scores}
            ranges={data.ranges}
            displayMode={data.displayMode}
          />
        </div>
      </section>

      <section
        className="card"
        aria-labelledby="engagement-heading"
        data-testid="snapshot-engagement"
      >
        <h2 id="engagement-heading" className="font-display text-xl font-bold text-ink">
          {c.recommendedLabel}
        </h2>
        <p
          className="mt-2 text-base font-semibold text-purple"
          data-testid="snapshot-engagement-name"
        >
          {data.recommendedEngagement || data.bucket || "Launch"}
        </p>
        {data.reasoning ? (
          <p
            className="mt-3 text-sm leading-relaxed text-ink-soft"
            data-testid="snapshot-reasoning"
          >
            {data.reasoning}
          </p>
        ) : null}
      </section>

      <section className="card" aria-labelledby="findings-heading" data-testid="snapshot-findings">
        <h2 id="findings-heading" className="font-display text-xl font-bold text-ink">
          {c.findingsLabel}
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink-soft">
          {findings.map((f) => (
            <li key={f} data-testid="snapshot-finding">
              {f}
            </li>
          ))}
        </ul>
      </section>

      <section className="card" aria-labelledby="pricing-heading" data-testid="snapshot-pricing">
        <h2 id="pricing-heading" className="font-display text-xl font-bold text-ink">
          {c.pricingLabel}
        </h2>
        <ul className="mt-3 space-y-1.5 text-sm text-ink-soft">
          <li data-testid="pricing-harden">{pricing.harden}</li>
          <li data-testid="pricing-launch">{pricing.launch}</li>
          <li data-testid="pricing-scale">{pricing.scale}</li>
          <li data-testid="pricing-enterprise">{pricing.enterprise}</li>
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
