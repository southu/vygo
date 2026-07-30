import type { Metadata } from "next";
import {
  learningDevelopmentLeadersCampaign,
  LEARNING_DEV_LEADERS_ROBOTS,
} from "@/content/campaigns/learning-development-leaders";
import { CampaignShell } from "@/components/campaign-landing/CampaignShell";

const { meta } = learningDevelopmentLeadersCampaign;

/**
 * Independently addressable "scalable learning support for L&D / enablement
 * leaders" landing page (campaign brief, Campaign 2).
 *
 * A dedicated top-level route (not the shared /campaign/[slug] surface) so the
 * campaign owns a stable, indexable URL. Reuses the configuration-driven
 * {@link CampaignShell}, which self-instruments the shared conversion layer
 * (stable landing_page_id + per-CTA cta_location) and preserves approved
 * attribution. Its primary conversion is a waitlist application submitted on the
 * page's own waitlist form — distinct from Campaign 1's assessment-start flow.
 */
export const metadata: Metadata = {
  // Absolute so the root "%s | vygo.ai" template does not double the suffix.
  title: { absolute: meta.title },
  description: meta.description,
  alternates: { canonical: meta.canonical },
  // Explicitly indexable — this is a public campaign landing page.
  robots: LEARNING_DEV_LEADERS_ROBOTS,
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
    images: [meta.ogImage],
  },
};

export default function LearningDevelopmentLeadersPage() {
  return <CampaignShell config={learningDevelopmentLeadersCampaign} />;
}
