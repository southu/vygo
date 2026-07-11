import Link from "next/link";
import type { InsightArticle } from "@/content/insights";

type ArticleCardProps = {
  article: InsightArticle;
};

export function ArticleCard({ article }: ArticleCardProps) {
  return (
    <article className="card h-full">
      <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">
        {article.topics.join(" · ")}
      </p>
      <h3 className="mt-2 font-display text-lg font-semibold text-ink">
        <Link href={`/insights/${article.slug}`} className="hover:text-purple">
          {article.title}
        </Link>
      </h3>
      <p className="mt-3 text-sm text-muted">{article.description}</p>
    </article>
  );
}
