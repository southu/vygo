import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getInsightBySlug, insightArticles } from "@/content/insights";
import { ctas, ctaHrefs } from "@/content/ctas";
import { CtaLink } from "@/components/CtaLink";

type PageProps = {
  params: Promise<{ slug: string }>;
};

/**
 * Static export requires generateStaticParams. We include draft seeds so the
 * route is known at build time; unpublished drafts call notFound() and are not
 * publicly readable article pages.
 */
export function generateStaticParams() {
  return insightArticles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = getInsightBySlug(slug);
  if (!article || article.status !== "published") {
    return { title: "Article not found", robots: { index: false, follow: false } };
  }
  return {
    title: article.title,
    description: article.description,
  };
}

export default async function InsightArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const article = getInsightBySlug(slug);

  // Drafts and unknown slugs are not publicly readable.
  if (!article || article.status !== "published") {
    notFound();
  }

  return (
    <main id="main-content">
      <article className="section-pad">
        <div className="container-page max-w-prose">
          <p className="eyebrow">{article.topics.join(" · ")}</p>
          <h1 className="mt-4 font-display text-4xl font-bold">{article.title}</h1>
          <p className="mt-4 text-lg text-muted">{article.description}</p>
          <div className="prose-page mt-10">
            {article.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <div className="mt-12 rounded-card border border-border bg-surface p-6">
            <p className="text-sm font-medium text-ink-soft">{ctas.insightContextual}</p>
            <div className="mt-4">
              <CtaLink href={ctaHrefs.waitlist}>{ctas.applyNextAuditOpening}</CtaLink>
            </div>
          </div>
        </div>
      </article>
    </main>
  );
}
