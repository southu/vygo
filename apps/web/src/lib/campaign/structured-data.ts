// Relative import (not the "@/" alias) so this pure data module can be loaded
// directly by the node:test suite, which does not resolve tsconfig path aliases.
import type { CampaignConfig } from "./types";

/**
 * Derive schema.org JSON-LD for a campaign landing page from its approved
 * configuration only — no new copy, claims, or proof is introduced. Every value
 * is a verbatim copy of already-rendered, brief-grounded config text:
 *
 *   - A `WebPage` node carries the page's unique name/description and canonical
 *     URL, mirroring the page metadata.
 *   - A `FAQPage` node (emitted only when the campaign has a `faq` section)
 *     mirrors the on-page objection Q&A verbatim, so the structured answers
 *     always match the visible text (a schema.org FAQ requirement) and can never
 *     assert a claim the page does not already display.
 *
 * The shape matches the homepage's existing FAQPage JSON-LD convention
 * (apps/web/src/app/page.tsx) so the site emits structured data consistently.
 */
export type CampaignJsonLd = Record<string, unknown>;

export function campaignStructuredData(config: CampaignConfig): CampaignJsonLd[] {
  const { meta } = config;

  const webPage: CampaignJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: meta.title,
    description: meta.description,
    url: meta.canonical,
    inLanguage: "en",
  };

  const nodes: CampaignJsonLd[] = [webPage];

  const faqSection = config.sections.find((section) => section.type === "faq");
  if (faqSection && faqSection.type === "faq" && faqSection.data.items.length > 0) {
    nodes.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqSection.data.items.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    });
  }

  return nodes;
}
