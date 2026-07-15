import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/content/site";
import { NextAuditStartDate } from "@/components/NextAuditStartDate";

export const metadata: Metadata = {
  title: "Apply — vygo.ai",
  description:
    "Apply for the next Production Readiness Audit or production engineering opening with vygo, operated by VYGO LLC.",
  robots: { index: false, follow: false },
};

/**
 * Application form page. Destination of the Apply CTA. This is an intentional
 * placeholder for the next mission, which fleshes out the full application
 * form; the heading and form structure below make the page identifiable as an
 * application form today.
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
            Tell us about your product and where you are headed. A senior engineer at vygo, operated
            by VYGO LLC, reviews every application against available openings. Submitting this form
            does not form a client relationship. Services begin only under a separately executed
            agreement with VYGO LLC.
          </p>

          <NextAuditStartDate />

          <form className="mt-10 space-y-5" data-testid="apply-form" aria-label="Application form">
            <div>
              <label htmlFor="apply-name" className="block text-sm font-semibold text-ink">
                Full name
              </label>
              <input
                id="apply-name"
                name="fullName"
                type="text"
                autoComplete="name"
                className="mt-2 w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-ink"
                placeholder="Your name"
              />
            </div>

            <div>
              <label htmlFor="apply-email" className="block text-sm font-semibold text-ink">
                Work email
              </label>
              <input
                id="apply-email"
                name="email"
                type="email"
                autoComplete="email"
                className="mt-2 w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-ink"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label htmlFor="apply-product" className="block text-sm font-semibold text-ink">
                Product URL
              </label>
              <input
                id="apply-product"
                name="productUrl"
                type="url"
                className="mt-2 w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-ink"
                placeholder="https://example.com"
              />
            </div>

            <div>
              <label htmlFor="apply-message" className="block text-sm font-semibold text-ink">
                What are you trying to get into production?
              </label>
              <textarea
                id="apply-message"
                name="message"
                rows={4}
                className="mt-2 w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-ink"
                placeholder="A few sentences on your product, users, and timeline."
              />
            </div>

            <p className="text-sm text-muted" data-apply-placeholder>
              The full application form is on the way. In the meantime you can reach us directly at{" "}
              <a
                href="mailto:hello@vygo.ai"
                className="font-semibold text-purple hover:text-purple-dark"
              >
                hello@vygo.ai
              </a>
              .
            </p>

            <button type="submit" className="btn-primary" data-testid="apply-submit">
              Submit application
            </button>
          </form>

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
