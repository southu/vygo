import type { Metadata } from "next";
import Link from "next/link";
import { readinessContent } from "@/content/readiness";

export const metadata: Metadata = {
  title: "Readiness fallback questionnaire",
  description:
    "Stub entry point for the readiness fallback questionnaire when you cannot run the diagnostic agent.",
  robots: { index: false, follow: false },
};

/**
 * Stub fallback questionnaire entry point.
 * Full questionnaire can replace this page later without changing the route.
 */
export default function ReadinessFallbackPage() {
  const c = readinessContent.fallback;
  return (
    <main id="main-content">
      <section className="section-pad">
        <div className="container-page max-w-2xl">
          <p className="eyebrow">{c.eyebrow}</p>
          <h1 className="mt-4 font-display text-3xl font-bold sm:text-4xl">{c.title}</h1>
          <p className="mt-5 text-lg text-muted">{c.body}</p>
          <div className="card mt-8">
            <p className="text-sm text-ink-soft">
              Prefer email? Write to{" "}
              <a className="font-semibold text-purple hover:text-purple-dark" href="mailto:hello@vygo.ai">
                hello@vygo.ai
              </a>
              .
            </p>
          </div>
          <div className="mt-10">
            <Link
              href="/readiness"
              className="text-sm font-semibold text-purple hover:text-purple-dark"
              data-testid="readiness-fallback-back"
            >
              ← {c.back}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
