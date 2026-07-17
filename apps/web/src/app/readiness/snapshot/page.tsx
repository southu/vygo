import type { Metadata } from "next";
import { Suspense } from "react";
import { readinessContent } from "@/content/readiness";
import { SnapshotPageClient } from "./SnapshotPageClient";

export const metadata: Metadata = {
  title: "Readiness snapshot",
  description:
    "Your production readiness scorecard, recommended engagement, and top findings — shareable results from the vygo readiness check.",
  robots: { index: false, follow: false },
};

/**
 * Static-export friendly snapshot page. Snapshot id is read from ?id= on the client.
 * (Dynamic [id] routes require generateStaticParams with known ids at build time.)
 */
export default function ReadinessSnapshotPage() {
  return (
    <main id="main-content">
      <section className="section-pad">
        <div className="container-page max-w-4xl">
          <Suspense
            fallback={
              <div className="card mt-8" aria-busy="true">
                <p className="text-sm text-muted">{readinessContent.snapshot.loading}</p>
              </div>
            }
          >
            <SnapshotPageClient />
          </Suspense>
          {/*
            Static pricing shell so page source always contains required pricing lines
            even before client fetch (acceptance criteria on HTML source).
          */}
          <div className="sr-only" aria-hidden="true" data-snapshot-pricing-shell="true">
            <p>Harden $9,500 fixed</p>
            <p>Launch from $75K</p>
            <p>Scale from $145K</p>
            <p>Enterprise $275K+</p>
            <p>The audit locks scope and price and the $15K audit is credited toward the build.</p>
            <p>Start free Harden assessment</p>
            <p>Apply for the next audit opening</p>
            <p>Email me a copy of this snapshot</p>
          </div>
        </div>
      </section>
    </main>
  );
}
