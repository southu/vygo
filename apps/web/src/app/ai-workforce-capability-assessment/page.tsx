import type { Metadata } from "next";
import {
  aiWorkforceAssessmentCampaign,
  AI_WORKFORCE_ASSESSMENT_ROBOTS,
} from "@/content/campaigns/ai-workforce-capability-assessment";
import { CampaignShell } from "@/components/campaign-landing/CampaignShell";

const { meta } = aiWorkforceAssessmentCampaign;

/**
 * Independently addressable AI production-readiness assessment landing page.
 *
 * A dedicated top-level route (not the shared /campaign/[slug] surface) so the
 * campaign owns a stable, indexable URL. Reuses the configuration-driven
 * {@link CampaignShell}, which self-instruments the shared conversion layer
 * (stable landing_page_id + per-CTA cta_location) and preserves approved
 * attribution parameters onto the assessment-start handoff.
 */
export const metadata: Metadata = {
  // Absolute so the root "%s | vygo.ai" template does not double the suffix.
  title: { absolute: meta.title },
  description: meta.description,
  alternates: { canonical: meta.canonical },
  // Explicitly indexable — this is a public campaign landing page.
  robots: AI_WORKFORCE_ASSESSMENT_ROBOTS,
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

export default function AiWorkforceCapabilityAssessmentPage() {
  return <CampaignShell config={aiWorkforceAssessmentCampaign} />;
}
