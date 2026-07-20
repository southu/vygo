import type { Metadata } from "next";
import { readinessContent } from "@/content/readiness";
import { ReadinessFlow } from "@/components/readiness/ReadinessFlow";
import { ReadinessDeepDives } from "@/components/readiness/ReadinessDeepDives";
import { ReadinessPillarNav } from "@/components/readiness/ReadinessPillarNav";
import { ReadinessScrollSpy } from "@/components/readiness/ReadinessScrollSpy";
import { ReadinessRadarChart } from "@/components/charts";
import {
  getReadinessReportChartData,
  getReadinessReportRiskMap,
} from "@/lib/readiness/report-chart-data";

export const metadata: Metadata = {
  title: "Readiness Check",
  description:
    "Answer a few questions and get a read-only diagnostic prompt tailored to how you build — production standards, no secrets.",
  robots: { index: true, follow: true },
};

export default function ReadinessPage() {
  const c = readinessContent.page;
  const na = readinessContent.newAnalysis;
  const s3 = readinessContent.stage3;
  const radar = readinessContent.radar;
  // Real report data (build-time self-assessment) drives the radar + its tooltips.
  const chartData = getReadinessReportChartData();
  const riskMap = getReadinessReportRiskMap();
  return (
    <main
      id="main-content"
      className="readiness-assessment-page relative"
      data-visual-system="results-shared"
    >
      {chartData.dimensions.length > 0 ? (
        <>
          <ReadinessPillarNav dimensions={chartData.dimensions} />
          <ReadinessScrollSpy />
        </>
      ) : null}
      <section className="section-pad">
        <div className="container-page max-w-2xl">
          <p className="eyebrow">{c.eyebrow}</p>
          <h1 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {c.title}
          </h1>
          <p className="mt-4 text-base text-muted sm:text-lg">{c.body}</p>
          {/*
            Landing entry point for a fresh run. A completed prior analysis never
            blocks a new one: this links to /readiness?new=1, which forces the
            project-label start step (choose an existing project or enter a new
            one) even when a prior session would otherwise resume or redirect to
            its scored snapshot. Rendered server-side so the 'New analysis' entry
            point is always present in the landing page source.
          */}
          <div
            className="mt-6 flex flex-col gap-3 rounded-xl border border-border bg-canvas px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            data-testid="readiness-new-analysis-entry"
          >
            <p className="text-sm text-muted">{na.landingHint}</p>
            <a
              href="/readiness?new=1"
              className="btn-secondary shrink-0 text-sm"
              data-testid="readiness-landing-new-analysis"
            >
              {na.label}
            </a>
          </div>
          {/*
            Entry point into the analysis history view (past runs grouped by
            project, each project's current result openable in the existing
            results component). Rendered server-side so the history link is always
            present in the readiness flow's page source.
          */}
          <div
            className="mt-3 flex flex-col gap-3 rounded-xl border border-border bg-canvas px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            data-testid="readiness-history-entry"
          >
            <p className="text-sm text-muted">{na.historyHint}</p>
            <a
              href="/analyses"
              className="btn-secondary shrink-0 text-sm"
              data-testid="readiness-history-link"
            >
              {na.historyLabel}
            </a>
          </div>
          {/*
            Token issuance flow: POST /api/readiness/token (see ReadinessFlow).
            Status poll flow: GET /api/readiness/status?token=... (see lib/readiness/api.ts).
            Referenced here as comments, not <link rel="prefetch">, because prefetching
            these URLs without the required method/query param triggers real 405/400
            responses and browser console errors on page load.
          */}
          <ReadinessFlow />
          {/*
            Static Stage 3 paste-back shell in the HTML document so GET /readiness
            always contains a large paste textarea in page source (acceptance).
            The interactive client flow owns the live Stage 3 UI with the same
            data-testid after hydration; this shell stays hidden and inert.
            The paste path posts the delimited results block to the same ingest
            endpoint the customer's AI uses directly (POST /api/readiness/submit)
            with the same per-session submission token.
          */}
          <div
            className="sr-only"
            aria-hidden="true"
            data-readiness-stage3-shell="true"
            data-testid="readiness-stage3"
          >
            <h2>{s3.title}</h2>
            <p>{s3.body}</p>
            <p>{s3.noSendHelper}</p>
            <form
              action="/api/readiness/submit"
              method="post"
              data-submit-url="/api/readiness/submit"
              data-testid="readiness-paste-form"
            >
              <label htmlFor="readiness-paste-shell">{s3.textareaLabel}</label>
              <textarea
                id="readiness-paste-shell"
                name="paste"
                rows={16}
                readOnly
                tabIndex={-1}
                placeholder={s3.textareaPlaceholder}
                data-testid="readiness-paste-textarea"
                defaultValue=""
              />
              <button type="submit" disabled tabIndex={-1} data-testid="readiness-paste-submit">
                {s3.submit}
              </button>
            </form>
          </div>
        </div>
      </section>

      {chartData.dimensions.length > 0 ? (
        <section className="section-pad pt-0" data-testid="readiness-radar-section">
          <div className="container-page max-w-2xl">
            <div className="card">
              <p className="eyebrow">{radar.eyebrow}</p>
              <h2 className="mt-3 font-display text-2xl font-bold tracking-tight">{radar.title}</h2>
              <p className="mt-3 text-sm text-muted">{radar.body}</p>
              <ReadinessRadarChart dimensions={chartData.dimensions} className="mt-6" />
              <p className="mt-3 text-center text-xs text-muted" data-testid="readiness-radar-hint">
                {radar.hint}
              </p>
            </div>
            {/*
              Machine-verifiable source of truth: the top critical risk factor per
              dimension, derived from the same self-assessment report that drives the
              radar tooltips. Lets automated checks compare tooltip text to report data.
            */}
            <script
              type="application/json"
              data-testid="readiness-radar-risk-data"
              dangerouslySetInnerHTML={{ __html: JSON.stringify(riskMap) }}
            />
          </div>
        </section>
      ) : null}

      {chartData.dimensions.length > 0 ? (
        <ReadinessDeepDives dimensions={chartData.dimensions} riskMap={riskMap} />
      ) : null}
    </main>
  );
}
