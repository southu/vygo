/**
 * Configuration-driven campaign landing pages.
 *
 * A campaign is described entirely by data: which shared section types render,
 * in what order, with what copy and calls-to-action. The shell renders exactly
 * the sections a campaign enables (no empty placeholders) and serializes the
 * ordered configuration into the DOM so the rendered order and enabled set are
 * verifiable from the page source.
 */

/** Button styles shared with the site design system (see globals.css .btn-*). */
export type CampaignCtaVariant = "primary" | "secondary" | "on-dark" | "ghost-on-dark";

export type CampaignCta = {
  label: string;
  /** Same-origin route, in-page "#anchor", or approved external URL. */
  href: string;
  variant?: CampaignCtaVariant;
};

export type CampaignLink = {
  label: string;
  href: string;
};

/**
 * A responsive raster image. Content images additionally supply srcset/sizes;
 * below-the-fold images set lazy so the shell can emit loading="lazy".
 */
export type CampaignImage = {
  src: string;
  srcSet?: string;
  sizes?: string;
  width: number;
  height: number;
  alt: string;
  /** Below the fold → loading="lazy". Above the fold → eager. */
  lazy?: boolean;
};

/** Every shared section type the capability can render. */
export type CampaignSectionType =
  | "hero"
  | "benefits"
  | "method"
  | "assurance"
  | "faq"
  | "lead"
  | "closingCta";

/**
 * The full menu of shared section types. A campaign enables a subset; anything
 * not listed in its `sections` is simply not rendered (optional sections).
 */
export const ALL_CAMPAIGN_SECTION_TYPES: readonly CampaignSectionType[] = [
  "hero",
  "benefits",
  "method",
  "assurance",
  "faq",
  "lead",
  "closingCta",
] as const;

export type HeroSectionData = {
  eyebrow?: string;
  heading: string;
  subheading: string;
  bullets?: string[];
  primaryCta: CampaignCta;
  secondaryCta?: CampaignCta;
};

export type BenefitsSectionData = {
  eyebrow?: string;
  title: string;
  intro?: string;
  items: { title: string; body: string }[];
};

export type MethodSectionData = {
  eyebrow?: string;
  title: string;
  intro?: string;
  steps: { name: string; body: string }[];
  media?: CampaignImage;
};

export type AssuranceSectionData = {
  eyebrow?: string;
  title: string;
  intro?: string;
  items: string[];
};

export type FaqSectionData = {
  eyebrow?: string;
  title: string;
  intro?: string;
  items: { question: string; answer: string }[];
};

export type LeadSectionData = {
  eyebrow?: string;
  title: string;
  intro?: string;
  nameLabel: string;
  emailLabel: string;
  consentLabel: string;
  submitLabel: string;
  successMessage: string;
  footnote?: string;
};

export type ClosingCtaSectionData = {
  eyebrow?: string;
  title: string;
  body?: string;
  primaryCta: CampaignCta;
  secondaryCta?: CampaignCta;
};

/** Discriminated union pairing each section type with its content shape. */
export type CampaignSection =
  | { id: string; type: "hero"; data: HeroSectionData }
  | { id: string; type: "benefits"; data: BenefitsSectionData }
  | { id: string; type: "method"; data: MethodSectionData }
  | { id: string; type: "assurance"; data: AssuranceSectionData }
  | { id: string; type: "faq"; data: FaqSectionData }
  | { id: string; type: "lead"; data: LeadSectionData }
  | { id: string; type: "closingCta"; data: ClosingCtaSectionData };

export type CampaignMeta = {
  title: string;
  description: string;
  /** Absolute canonical URL on the production host. */
  canonical: string;
  ogTitle: string;
  ogDescription: string;
  /** Absolute Open Graph image URL. */
  ogImage: string;
  ogImageAlt: string;
};

export type CampaignNavConfig = {
  homeHref: string;
  homeLabel: string;
  /** Reduced in-page / same-origin navigation links. */
  links: CampaignLink[];
  cta: CampaignCta;
};

export type CampaignFooterConfig = {
  summary: string;
  /** Privacy, terms, and accessibility destinations. */
  legalLinks: CampaignLink[];
  copyright: string;
};

export type CampaignConfig = {
  /** Stable campaign identifier, also the route slug. */
  id: string;
  slug: string;
  path: string;
  meta: CampaignMeta;
  nav: CampaignNavConfig;
  footer: CampaignFooterConfig;
  /** Ordered, enabled sections. Only these render. */
  sections: CampaignSection[];
};

/**
 * Machine-readable descriptor serialized into the page DOM so the rendered
 * order and enabled section set are verifiable from source.
 */
export type SerializedCampaign = {
  campaignId: string;
  path: string;
  availableSectionTypes: readonly CampaignSectionType[];
  /** Ordered section descriptors, matching DOM render order. */
  sections: { id: string; type: CampaignSectionType }[];
  /** Section types in render order. */
  order: CampaignSectionType[];
  /** The enabled (rendered) section types. */
  enabled: CampaignSectionType[];
};

export function serializeCampaign(config: CampaignConfig): SerializedCampaign {
  const sections = config.sections.map((section) => ({ id: section.id, type: section.type }));
  const order = sections.map((section) => section.type);
  return {
    campaignId: config.id,
    path: config.path,
    availableSectionTypes: ALL_CAMPAIGN_SECTION_TYPES,
    sections,
    order,
    enabled: order,
  };
}
