import Link from "next/link";
import type { LegalDocument } from "@/content/legal";
import { legalMeta } from "@/content/legal";

type Props = {
  document: LegalDocument;
};

export function LegalDocumentView({ document }: Props) {
  return (
    <main id="main-content" data-legal-status="published">
      <section className="section-pad">
        <div className="container-page max-w-prose">
          <p className="eyebrow">Legal</p>
          <h1 className="mt-4 font-display text-4xl font-bold">{document.title}</h1>
          <p className="mt-4 text-sm text-muted" data-legal-effective={legalMeta.effectiveDate}>
            Effective date: {legalMeta.effectiveDate}
          </p>
          <p className="mt-6 text-sm leading-relaxed text-muted">
            {document.intro.beforeLink}
            <Link
              href={document.intro.linkHref}
              className="font-medium text-ink underline underline-offset-2"
            >
              {document.intro.linkLabel}
            </Link>
            {document.intro.afterLink}
          </p>
          <div className="mt-10 space-y-8">
            {document.sections.map((section) => (
              <section key={section.heading}>
                <h2 className="font-display text-xl font-semibold text-ink">{section.heading}</h2>
                <div className="mt-3 space-y-3">
                  {section.blocks.map((block, index) => {
                    if (block.type === "paragraph") {
                      return (
                        <p
                          key={`${section.heading}-p-${index}`}
                          className="text-sm leading-relaxed text-muted"
                        >
                          {block.text}
                        </p>
                      );
                    }

                    return (
                      <ul
                        key={`${section.heading}-ul-${index}`}
                        className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted"
                      >
                        {block.items.map((item, itemIndex) => (
                          <li key={`${section.heading}-li-${itemIndex}`}>
                            {item.lead ? (
                              <>
                                <span className="font-medium text-ink">{item.lead}</span>{" "}
                                {item.text}
                              </>
                            ) : (
                              item.text
                            )}
                          </li>
                        ))}
                      </ul>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
