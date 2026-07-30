import type { MetadataRoute } from "next";
import { AI_WORKFORCE_ASSESSMENT_CANONICAL } from "@/content/campaigns/ai-workforce-capability-assessment";
import { LEARNING_DEV_LEADERS_CANONICAL } from "@/content/campaigns/learning-development-leaders";
import { WORKFORCE_CAPABILITY_CANONICAL } from "@/content/campaigns/leaders-workforce-capability";

// The site is a static export (`output: "export"`), so the generated
// `/sitemap.xml` must be fully static.
export const dynamic = "force-static";

/**
 * Crawlable sitemap exposing the production host and the independently
 * addressable campaign landing pages, so each campaign URL — including
 * /leaders/workforce-capability — is discoverable by crawlers without being
 * linked from the global site chrome the campaign shells intentionally omit.
 *
 * Emitted as a static `/sitemap.xml` at export time. Every URL uses its own
 * canonical (the production `https://www.vygo.ai` host) so the sitemap entries
 * always match each page's `<link rel="canonical">` and Open Graph URL.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    { url: "https://www.vygo.ai/", priority: 1 },
    { url: AI_WORKFORCE_ASSESSMENT_CANONICAL, priority: 0.8 },
    { url: LEARNING_DEV_LEADERS_CANONICAL, priority: 0.8 },
    { url: WORKFORCE_CAPABILITY_CANONICAL, priority: 0.8 },
  ];

  return routes.map((route) => ({
    url: route.url,
    changeFrequency: "weekly",
    priority: route.priority,
  }));
}
