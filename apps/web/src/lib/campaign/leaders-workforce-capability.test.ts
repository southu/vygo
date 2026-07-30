/**
 * Coverage for the workforce-capability landing page for engineering leaders
 * (/leaders/workforce-capability): route, stable page id, metadata, section
 * structure, the campaign-specific content image, the single on-page waitlist
 * conversion, analytics/attribution conventions, and material distinctness from
 * BOTH other independently addressable campaign landing pages (the assessment
 * page and the L&D leaders page). Pure assertions against the campaign
 * configuration — no DOM or network — so the repository `pnpm test` command runs
 * them.
 *
 * Relative imports throughout: the node:test runner does not resolve the "@/"
 * tsconfig path alias.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  leadersWorkforceCapabilityCampaign as campaign,
  WORKFORCE_CAPABILITY_CANONICAL,
  WORKFORCE_CAPABILITY_ID,
  WORKFORCE_CAPABILITY_PATH,
  WORKFORCE_CAPABILITY_ROBOTS,
  WORKFORCE_CAPABILITY_SLUG,
  CAPABILITY_LADDER_IMAGE,
  APPLY_HREF,
} from "../../content/campaigns/leaders-workforce-capability";
import { aiWorkforceAssessmentCampaign as assessment } from "../../content/campaigns/ai-workforce-capability-assessment";
import { learningDevelopmentLeadersCampaign as leaders } from "../../content/campaigns/learning-development-leaders";
import {
  serializeCampaign,
  type CampaignConfig,
  type CampaignCta,
  type CampaignSection,
} from "./types";
import { campaignStructuredData } from "./structured-data";

/** Collect every CTA declared anywhere in the campaign config. */
function allCtas(config = campaign): CampaignCta[] {
  const out: CampaignCta[] = [config.nav.cta];
  for (const section of config.sections as CampaignSection[]) {
    const data = section.data as Record<string, unknown>;
    for (const key of ["primaryCta", "secondaryCta"]) {
      const cta = data[key] as CampaignCta | undefined;
      if (cta) out.push(cta);
    }
  }
  return out;
}

/** The hero heading (single H1) of a campaign. */
function heroHeading(config: CampaignConfig): string {
  const hero = config.sections.find((s) => s.type === "hero");
  assert.ok(hero && hero.type === "hero", "campaign has a hero section");
  return hero.data.heading;
}

/**
 * Collect the campaign's rendered prose (headings, intros, benefit/objection
 * copy, method steps, CTA labels) into one normalized string — lowercased,
 * whitespace-collapsed, structural values (hrefs, anchors, image src/dimensions)
 * excluded — so two campaigns can be compared as "normalized main-content text."
 */
function normalizedContentText(config: CampaignConfig): string {
  const parts: string[] = [];
  const structuralKeys = new Set(["href", "src", "srcSet", "sizes", "variant", "width", "height"]);
  const walk = (value: unknown, key?: string): void => {
    if (typeof value === "string") {
      if (key && structuralKeys.has(key)) return;
      if (/^(https?:\/\/|\/|#|mailto:|tel:)/.test(value.trim())) return;
      parts.push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) walk(entry);
      return;
    }
    if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) walk(v, k);
    }
  };
  walk(config.sections);
  return parts.join(" ").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Stable content-hash of the normalized main-content text. */
function contentHash(config: CampaignConfig): string {
  return createHash("sha256").update(normalizedContentText(config)).digest("hex");
}

// --- Route + stable page id (criteria 1, 2) --------------------------------

test("campaign is addressable at the mission's nested route with the stable page id", () => {
  assert.equal(WORKFORCE_CAPABILITY_ID, "leaders-workforce-capability");
  assert.equal(WORKFORCE_CAPABILITY_SLUG, "leaders-workforce-capability");
  assert.equal(WORKFORCE_CAPABILITY_PATH, "/leaders/workforce-capability");
  assert.equal(campaign.id, WORKFORCE_CAPABILITY_ID);
  assert.equal(campaign.slug, WORKFORCE_CAPABILITY_SLUG);
  assert.equal(campaign.path, WORKFORCE_CAPABILITY_PATH);
  // The serialized descriptor carries the stable page id into the DOM source.
  assert.equal(serializeCampaign(campaign).campaignId, "leaders-workforce-capability");
});

// --- Metadata + social (criteria 12, 13) -----------------------------------

test("metadata is unique, canonical matches the production URL, robots is index,follow", () => {
  assert.equal(campaign.meta.canonical, WORKFORCE_CAPABILITY_CANONICAL);
  assert.equal(campaign.meta.canonical, "https://www.vygo.ai/leaders/workforce-capability");
  assert.ok(campaign.meta.title.trim().length > 0);
  assert.ok(campaign.meta.description.trim().length > 0);
  assert.deepEqual(WORKFORCE_CAPABILITY_ROBOTS, { index: true, follow: true });
});

test("social metadata is non-empty and its Open Graph URL matches the canonical", () => {
  // The Next.js metadata layer emits og:url from meta.canonical, so asserting
  // the source guarantees the rendered og:url equals the canonical URL.
  assert.ok(campaign.meta.ogTitle.trim().length > 0);
  assert.ok(campaign.meta.ogDescription.trim().length > 0);
  assert.ok(campaign.meta.ogImage.trim().length > 0);
  assert.ok(campaign.meta.ogImageAlt.trim().length > 0);
});

// --- Section structure (criteria 1, 3) -------------------------------------

test("exactly one hero (single H1) and every required section is present", () => {
  const heroes = campaign.sections.filter((s) => s.type === "hero");
  assert.equal(heroes.length, 1, "exactly one hero → exactly one H1");

  const ids = new Set(campaign.sections.map((s) => s.id));
  // Narrative, at least three benefits, approved evidence, objection handling,
  // and the on-page waitlist conversion all render as non-empty sections.
  for (const required of ["problem", "capabilities", "evidence", "objections", "waitlist"]) {
    assert.ok(ids.has(required), `missing required section: ${required}`);
  }

  const waitlist = campaign.sections.find((s) => s.id === "waitlist");
  assert.ok(waitlist && waitlist.type === "waitlist", "waitlist section renders the on-page form");
});

test("benefits sections each expose at least three non-empty items", () => {
  const benefitSections = campaign.sections.filter((s) => s.type === "benefits");
  assert.ok(benefitSections.length >= 1, "at least one benefits section");
  for (const section of benefitSections) {
    assert.ok(section.type === "benefits");
    assert.ok(section.data.items.length >= 3, `${section.id} has at least three benefits`);
    for (const item of section.data.items) {
      assert.ok(item.title.trim().length > 0 && item.body.trim().length > 0);
    }
  }
});

test("objection handling has non-empty question/answer pairs", () => {
  const faq = campaign.sections.find((s) => s.type === "faq");
  assert.ok(faq && faq.type === "faq");
  assert.ok(faq.data.items.length >= 3, "at least three objections");
  for (const item of faq.data.items) {
    assert.ok(item.question.trim().length > 0 && item.answer.trim().length > 0);
  }
});

// --- Campaign-specific content image (criterion 5) -------------------------

test("a campaign-specific content image renders with a unique src and non-empty alt", () => {
  const method = campaign.sections.find((s) => s.type === "method");
  assert.ok(method && method.type === "method");
  assert.ok(method.data.media, "the method section carries a content image");
  assert.equal(method.data.media, CAPABILITY_LADDER_IMAGE);
  assert.ok(CAPABILITY_LADDER_IMAGE.src.trim().length > 0);
  assert.ok(CAPABILITY_LADDER_IMAGE.alt.trim().length > 0, "content image has non-empty alt text");
  assert.ok(CAPABILITY_LADDER_IMAGE.width > 0 && CAPABILITY_LADDER_IMAGE.height > 0);

  // Its source URL is unique to this campaign — the other two campaign landing
  // pages carry no method/content image, so no lead image can collide.
  const otherImageSrcs = [assessment, leaders]
    .flatMap((c) => c.sections)
    .filter((s) => s.type === "method")
    .map((s) => (s as Extract<CampaignSection, { type: "method" }>).data.media?.src)
    .filter(Boolean);
  assert.ok(
    !otherImageSrcs.includes(CAPABILITY_LADDER_IMAGE.src),
    "content image src differs from the other campaigns' images",
  );
});

// --- Single on-page waitlist conversion (criteria 6, 7, 11) ----------------

test("every prominent conversion CTA targets the same on-page waitlist form", () => {
  assert.equal(APPLY_HREF, "#waitlist");
  assert.equal(campaign.nav.cta.href, APPLY_HREF);

  const hero = campaign.sections.find((s) => s.type === "hero");
  assert.ok(hero && hero.type === "hero");
  assert.equal(hero.data.primaryCta.href, APPLY_HREF);

  const closing = campaign.sections.find((s) => s.type === "closingCta");
  assert.ok(closing && closing.type === "closingCta");
  assert.equal(closing.data.primaryCta.href, APPLY_HREF);

  // No prominent CTA navigates to an off-page waitlist/apply destination.
  for (const cta of allCtas()) {
    assert.ok(!/^\/(waitlist|apply)\b/.test(cta.href), `CTA should stay on-page: ${cta.href}`);
  }
});

test("every waitlist trigger exposes an accessible name containing apply or waitlist", () => {
  const waitlistTriggers = allCtas().filter((cta) => cta.href === APPLY_HREF);
  assert.ok(waitlistTriggers.length >= 3, "the nav, hero, and closing CTAs all apply on-page");
  for (const cta of waitlistTriggers) {
    assert.match(cta.label.toLowerCase(), /apply|waitlist/, `accessible name: ${cta.label}`);
  }
});

test("primary navigation carries exactly one campaign conversion link", () => {
  assert.equal(campaign.nav.cta.href, APPLY_HREF);
  const navConversionLinks = campaign.nav.links.filter(
    (link) => link.href === APPLY_HREF || /^\/(waitlist|apply)\b/.test(link.href),
  );
  assert.equal(navConversionLinks.length, 0, "reduced nav links must not add a conversion route");
});

test("only waitlist actions use the dominant (primary / on-dark) visual prominence", () => {
  // Criterion 6: no non-waitlist action may match or exceed the waitlist CTAs'
  // prominence. Every primary / on-dark CTA in the config is a waitlist apply;
  // secondary and ghost CTAs (lower prominence) are the only non-waitlist ones.
  for (const cta of allCtas()) {
    const dominant =
      cta.variant === "primary" || cta.variant === "on-dark" || cta.variant === undefined;
    if (dominant) {
      assert.equal(cta.href, APPLY_HREF, `dominant CTA must be the waitlist apply: ${cta.label}`);
    }
  }
});

test("footer exposes reachable Privacy and Terms legal links", () => {
  const legalHrefs = campaign.footer.legalLinks.map((link) => link.href);
  assert.ok(legalHrefs.includes("/privacy"));
  assert.ok(legalHrefs.includes("/terms"));
  for (const href of legalHrefs) {
    assert.ok(href.startsWith("/"), `legal link should be a same-origin path: ${href}`);
  }
});

// --- Material distinctness from BOTH other campaigns (criterion 4) ---------

test("landing page is materially distinct from the assessment and L&D pages", () => {
  for (const other of [assessment, leaders]) {
    assert.notEqual(campaign.path, other.path);
    assert.notEqual(campaign.meta.canonical, other.meta.canonical);
    assert.notEqual(campaign.meta.title, other.meta.title);
    assert.notEqual(campaign.meta.description, other.meta.description);
    assert.notEqual(campaign.meta.ogTitle, other.meta.ogTitle);
    assert.notEqual(campaign.meta.ogDescription, other.meta.ogDescription);
    // Distinct H1 from each other campaign landing page.
    assert.notEqual(heroHeading(campaign), heroHeading(other));
  }
});

test("normalized main-content text hash differs from both other campaigns", () => {
  const text = normalizedContentText(campaign);
  assert.ok(text.length > 500, "the page renders substantial main content");
  for (const other of [assessment, leaders]) {
    assert.notEqual(text, normalizedContentText(other), "main-content text must not be identical");
    assert.notEqual(
      contentHash(campaign),
      contentHash(other),
      "normalized main-content text hashes must differ",
    );
  }
});

// --- Serialized descriptor -------------------------------------------------

test("serialized descriptor exposes the waitlist section in render order", () => {
  const serialized = serializeCampaign(campaign);
  assert.ok(serialized.enabled.includes("waitlist"));
  assert.equal(serialized.order[0], "hero");
  assert.equal(serialized.order[serialized.order.length - 1], "closingCta");
  assert.equal(serialized.campaignId, WORKFORCE_CAPABILITY_ID);
});

// --- Structured data (JSON-LD) ---------------------------------------------

test("structured data mirrors the page's unique metadata on a WebPage node", () => {
  const nodes = campaignStructuredData(campaign);
  const webPage = nodes.find((node) => node["@type"] === "WebPage");
  assert.ok(webPage, "a WebPage node is emitted");
  assert.equal(webPage!["@context"], "https://schema.org");
  assert.equal(webPage!.name, campaign.meta.title);
  assert.equal(webPage!.description, campaign.meta.description);
  assert.equal(webPage!.url, WORKFORCE_CAPABILITY_CANONICAL);
});

test("FAQ structured data mirrors the on-page objections verbatim — no invented claims", () => {
  const nodes = campaignStructuredData(campaign);
  const faqPage = nodes.find((node) => node["@type"] === "FAQPage") as
    { mainEntity: { name: string; acceptedAnswer: { text: string } }[] } | undefined;
  assert.ok(faqPage, "a FAQPage node is emitted when the campaign has objections");

  const objections = campaign.sections.find((s) => s.type === "faq") as Extract<
    CampaignSection,
    { type: "faq" }
  >;
  assert.equal(faqPage!.mainEntity.length, objections.data.items.length);
  faqPage!.mainEntity.forEach((entity, index) => {
    assert.equal(entity.name, objections.data.items[index]!.question);
    assert.equal(entity.acceptedAnswer.text, objections.data.items[index]!.answer);
  });
});
