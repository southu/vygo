import type { Metadata } from "next";
import { Suspense } from "react";
import { ChartsStagingClient } from "./ChartsStagingClient";

export const metadata: Metadata = {
  title: "Staging · Readiness charts",
  description:
    "Hidden staging surface for Vygo readiness radar, gauge, and sub-metric chart components.",
  robots: { index: false, follow: false },
};

/**
 * Hidden chart staging route — exactly /staging/charts.
 * Not linked from public navigation. Renders live readiness chart data.
 */
export default function StagingChartsPage() {
  return (
    <main id="main-content" className="overflow-x-hidden">
      <section className="section-pad">
        <div className="container-page max-w-5xl">
          <header>
            <p className="eyebrow">Internal staging</p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              Readiness charts
            </h1>
            <p className="mt-3 max-w-prose text-ink-soft">
              Reusable brand-styled chart layer for agentic-AI readiness and security posture.
              Powered by live scoring data from the readiness engine.
            </p>
          </header>

          <Suspense
            fallback={
              <div className="card mt-6" aria-busy="true">
                <p className="text-sm text-muted">Loading charts…</p>
              </div>
            }
          >
            <ChartsStagingClient />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
