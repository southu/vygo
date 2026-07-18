import { renderMarkdown, stripLeadingH1 } from "@/lib/markdown";
import {
  getGuideDocNav,
  guideOnePagerPrintHref,
  resolveGuidePackHref,
  type GuideDoc,
} from "@/content/ratchet-guide";

/**
 * Shared template for the rendered Ratchet guide documents under
 * /vibe-coding/ratchet-guide/. Renders the breadcrumb back to the guide index,
 * the document title (the pack's own H1), the markdown body with pack-internal
 * links rewritten to public URLs, and the prev/next guide navigation that
 * chains index → overview → architecture → one-pager → rebuild → ai-prompts →
 * footguns → back to index. Site header/footer and the mobile nav come from
 * the root layout, exactly as on the other module pages.
 */
export function GuideDocPage({
  doc,
  title,
  markdown,
  version,
}: {
  doc: GuideDoc;
  title: string;
  markdown: string;
  version: string;
}) {
  const { prev, next } = getGuideDocNav(doc.slug);
  const body = renderMarkdown(stripLeadingH1(markdown), { resolveHref: resolveGuidePackHref });

  return (
    <main id="main-content" data-guide-doc={doc.slug}>
      <section className="section-pad" data-section="doc-header">
        <div className="container-page max-w-4xl">
          <nav aria-label="Breadcrumb" className="text-sm text-muted" data-breadcrumb>
            <a href="/vibe-coding" className="font-medium text-purple hover:underline">
              Vibe coding
            </a>
            <span aria-hidden="true" className="mx-2">
              /
            </span>
            <a
              href="/vibe-coding/ratchet-guide"
              className="font-medium text-purple hover:underline"
            >
              Ratchet system guide
            </a>
            <span aria-hidden="true" className="mx-2">
              /
            </span>
            <span aria-current="page">{doc.title}</span>
          </nav>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <p className="eyebrow">Ratchet system guide · {version}</p>
            <span
              className="chip border-green/40 bg-green/10 text-green-dark"
              data-status="available"
            >
              Available
            </span>
          </div>
          <h1 className="mt-4 font-display text-4xl font-bold sm:text-5xl">{title}</h1>
          <div className="mt-6">
            <a
              href={`/content/vibe-coding/ratchet-guide/${doc.sourceFile}`}
              download={doc.sourceFile}
              className="btn-secondary"
              data-download-link="doc-markdown"
            >
              Download raw Markdown (.md)
            </a>
          </div>
          {doc.slug === "one-pager" ? (
            <div className="mt-8">
              <a
                href={guideOnePagerPrintHref}
                className="btn-secondary"
                data-print-link="one-pager-print"
              >
                Open the print-friendly one-pager (PDF-ready)
              </a>
              <p className="mt-3 text-sm text-muted">
                Self-contained print view of this document — letter format, inline graphics, no
                external assets. Use File → Print or Save as PDF.
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="section-pad border-t border-border" data-section="doc-content">
        <div className="container-page max-w-4xl">
          <div className="[&>:first-child]:mt-0">{body}</div>
        </div>
      </section>

      <section className="section-pad border-t border-border bg-surface" data-section="guide-nav">
        <div className="container-page max-w-4xl">
          <nav aria-label="Guide navigation" className="grid gap-4 sm:grid-cols-2" data-guide-nav>
            <a
              href={prev.href}
              className="card block transition-colors hover:border-purple"
              data-guide-prev
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                {prev.kicker}
              </p>
              <p className="mt-2 font-display text-lg font-semibold">{prev.title}</p>
            </a>
            <a
              href={next.href}
              className="card block transition-colors hover:border-purple"
              data-guide-next
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                {next.kicker}
              </p>
              <p className="mt-2 font-display text-lg font-semibold">{next.title}</p>
            </a>
          </nav>
        </div>
      </section>
    </main>
  );
}
