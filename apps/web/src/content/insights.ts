/**
 * Insights articles. Seed only as unpublished drafts until content is reviewed.
 * Public Insights navigation and published article links remain hidden while
 * no reviewed articles are published.
 */

export type InsightStatus = "draft" | "published";

export type InsightArticle = {
  slug: string;
  title: string;
  description: string;
  status: InsightStatus;
  /** ISO date string; only meaningful for published articles. */
  publishedAt: string | null;
  topics: string[];
  body: string[];
};

export const insightArticles: InsightArticle[] = [
  {
    slug: "production-readiness-checklist-lovable",
    title: "A production-readiness checklist for Lovable apps",
    description:
      "What to inspect before an AI-built Lovable prototype carries real users, data, or enterprise reviews.",
    status: "draft",
    publishedAt: null,
    topics: ["checklist", "lovable", "prototype"],
    body: [
      "Draft for editorial review. Not published.",
      "This placeholder will cover architecture, auth, data access, environments, and operational readiness for Lovable-built products.",
    ],
  },
  {
    slug: "enterprise-buyers-after-demo",
    title: "What enterprise buyers ask for after the demo works",
    description:
      "Security questionnaires, access controls, audit logs, and operational evidence that appear once the product is interesting.",
    status: "draft",
    publishedAt: null,
    topics: ["enterprise", "security", "procurement"],
    body: [
      "Draft for editorial review. Not published.",
      "This placeholder will cover common post-demo requirements without inventing customer stories.",
    ],
  },
  {
    slug: "open-row-level-security",
    title: "Open row-level security: what it means and how to test it",
    description:
      "How to reason about tenant isolation and row-level access when a prototype moves toward multi-tenant production use.",
    status: "draft",
    publishedAt: null,
    topics: ["security", "data", "tenancy"],
    body: [
      "Draft for editorial review. Not published.",
      "This placeholder will explain isolation risks and practical verification steps.",
    ],
  },
];

export function getPublishedInsights(): InsightArticle[] {
  return insightArticles.filter((a) => a.status === "published");
}

export function getInsightBySlug(slug: string): InsightArticle | undefined {
  return insightArticles.find((a) => a.slug === slug);
}

export function hasPublishedInsights(): boolean {
  return getPublishedInsights().length > 0;
}
