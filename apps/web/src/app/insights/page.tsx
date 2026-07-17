import type { Metadata } from "next";
import { site } from "@/content/site";
import { getPublishedInsights } from "@/content/insights";
import { ctas, ctaHrefs } from "@/content/ctas";
import { SectionHeading } from "@/components/SectionHeading";
import { ArticleCard } from "@/components/ArticleCard";
import { CtaLink } from "@/components/CtaLink";

export const metadata: Metadata = {
  title: site.metadata.insightsTitle,
  description: site.metadata.insightsDescription,
};

export default function InsightsIndexPage() {
  const published = getPublishedInsights();

  return (
    <main id="main-content">
      <section className="section-pad">
        <div className="container-page">
          <SectionHeading
            as="h1"
            eyebrow="Insights"
            title="Prototype teardowns and field notes"
            intro="Practical notes on production engineering for AI-built software. Articles are published only after editorial review."
          />

          {published.length > 0 ? (
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {published.map((article) => (
                <ArticleCard key={article.slug} article={article} />
              ))}
            </div>
          ) : (
            <div className="mt-10 card max-w-2xl">
              <h2 className="font-display text-xl font-semibold">No published articles yet</h2>
              <p className="mt-3 text-sm text-muted">
                Draft field notes are being prepared. Public article links and Insights navigation
                stay hidden until reviewed content is ready.
              </p>
              <p className="mt-3 text-sm text-muted">
                Meanwhile, the free{" "}
                <a href="/guide" className="font-medium text-purple hover:underline">
                  Ratchet system guide
                </a>{" "}
                is available to read and download.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <CtaLink href="/guide" variant="secondary">
                  Get the guide
                </CtaLink>
                <CtaLink href={ctaHrefs.waitlist}>{ctas.applyNextOpening}</CtaLink>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
