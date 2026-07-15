import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/content/site";
import { NextAuditStartDate } from "@/components/NextAuditStartDate";
import { ApplyForm } from "@/components/ApplyForm";

export const metadata: Metadata = {
  title: "Apply — vygo.ai",
  description:
    "Apply for the next Production Readiness Audit or production engineering opening with VYGO.",
  robots: { index: false, follow: false },
};

/**
 * Application form page. Destination of the Apply CTA.
 * Submissions POST to /api/apply and are stored in the Railway Postgres
 * applications table (never written from the browser).
 */
export default function ApplyPage() {
  return (
    <main id="main-content">
      <section className="section-pad">
        <div className="container-page max-w-2xl">
          <p className="eyebrow">Application</p>
          <h1 className="mt-4 font-display text-4xl font-bold sm:text-5xl">
            Apply for the next opening
          </h1>
          <p className="mt-5 text-lg text-muted">
            Tell us about your product and where you are headed. A senior engineer at VYGO reviews
            every application against available openings.
          </p>

          <NextAuditStartDate />

          <ApplyForm />

          <div className="mt-10 border-t border-border pt-6">
            <Link href="/" className="text-sm font-semibold text-purple hover:text-purple-dark">
              ← Back to {site.name}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
