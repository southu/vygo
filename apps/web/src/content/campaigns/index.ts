import type { CampaignConfig } from "@/lib/campaign/types";
import { studentSuccessCampaign } from "./student-success";

/**
 * Registry of configuration-driven campaign landing pages, keyed by slug. The
 * dynamic route at /campaign/[slug] renders any campaign registered here.
 */
export const campaigns: Record<string, CampaignConfig> = {
  [studentSuccessCampaign.slug]: studentSuccessCampaign,
};

export function getCampaign(slug: string): CampaignConfig | undefined {
  return campaigns[slug];
}

export function getCampaignSlugs(): string[] {
  return Object.keys(campaigns);
}
