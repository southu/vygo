/**
 * LEGAL REVIEW: Draft for legal review — not finalized legal advice.
 * Do not present as operative website terms until counsel approves.
 */
import type { Metadata } from "next";
import { site } from "@/content/site";
import { legalMeta, termsContent } from "@/content/legal";

export const metadata: Metadata = {
  title: site.metadata.termsTitle,
  description: "Draft website terms for vygo.ai. Not finalized legal advice.",
};

export default function TermsPage() {
  return (
    <main
      id="main-content"
      data-legal-review={legalMeta.reviewMarker}
      data-legal-status="draft-for-legal-review"
    >
      <section className="section-pad">
        <div className="container-page max-w-prose">
          <p className="eyebrow">Legal</p>
          <h1 className="mt-4 font-display text-4xl font-bold">{termsContent.title}</h1>
          <p
            className="mt-4 rounded-card border border-border bg-canvas px-4 py-3 text-sm text-muted"
            data-legal-review={legalMeta.reviewMarker}
          >
            {legalMeta.reviewLabel}. {legalMeta.disclaimer}
          </p>
          <div className="mt-10 space-y-8">
            {termsContent.sections.map((section) => (
              <section key={section.heading}>
                <h2 className="font-display text-xl font-semibold text-ink">{section.heading}</h2>
                <p className="mt-3 text-sm leading-relaxed text-muted">{section.body}</p>
              </section>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
