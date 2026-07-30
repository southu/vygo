import type { Metadata } from "next";
import {
  leadersWorkforceCapabilityCampaign,
  WORKFORCE_CAPABILITY_ROBOTS,
} from "@/content/campaigns/leaders-workforce-capability";
import { CampaignShell } from "@/components/campaign-landing/CampaignShell";
import { campaignStructuredData } from "@/lib/campaign/structured-data";

const { meta } = leadersWorkforceCapabilityCampaign;
const structuredData = campaignStructuredData(leadersWorkforceCapabilityCampaign);

/**
 * Independently addressable "workforce capability & builder engagement for
 * engineering leaders" landing page (campaign brief, Campaign 3).
 *
 * A dedicated nested route (not the shared /campaign/[slug] surface) so the
 * campaign owns a stable, indexable URL at /leaders/workforce-capability.
 * Reuses the configuration-driven {@link CampaignShell}, which self-instruments
 * the shared conversion layer (stable landing_page_id + per-CTA cta_location)
 * and preserves approved attribution. Its primary conversion is a waitlist
 * application submitted on the page's own waitlist form — distinct from
 * Campaign 1's assessment-start flow, and measured distinctly from Campaign 2.
 */
export const metadata: Metadata = {
  // Absolute so the root "%s | vygo.ai" template does not double the suffix.
  title: { absolute: meta.title },
  description: meta.description,
  alternates: { canonical: meta.canonical },
  // Explicitly indexable — this is a public campaign landing page.
  robots: WORKFORCE_CAPABILITY_ROBOTS,
  openGraph: {
    type: "website",
    url: meta.canonical,
    title: meta.ogTitle,
    description: meta.ogDescription,
    siteName: "vygo.ai",
    images: [{ url: meta.ogImage, width: 512, height: 512, alt: meta.ogImageAlt }],
  },
  twitter: {
    card: "summary_large_image",
    title: meta.ogTitle,
    description: meta.ogDescription,
    // Carry the same alt text as the Open Graph image so the Twitter/X card
    // image is not announced without a description.
    images: [{ url: meta.ogImage, alt: meta.ogImageAlt }],
  },
};

export default function LeadersWorkforceCapabilityPage() {
  return (
    <>
      {/* Grounded schema.org JSON-LD (WebPage + FAQPage) derived only from the
          approved campaign config — mirrors the homepage structured-data
          convention and introduces no new claim or proof. */}
      {structuredData.map((node, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(node) }}
        />
      ))}
      <CampaignShell config={leadersWorkforceCapabilityCampaign} />
    </>
  );
}
