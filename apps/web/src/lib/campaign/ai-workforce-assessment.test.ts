/**
 * Coverage for the AI production-readiness assessment landing page
 * (/ai-workforce-capability-assessment): route, metadata, analytics identity,
 * attribution preservation, responsive/CTA structure, and the critical
 * assessment-start handoff. Pure assertions against the campaign configuration
 * and the shared conversion helpers — no DOM or network — so the repository
 * `pnpm test` command runs them.
 *
 * Relative imports throughout: the node:test runner does not resolve the "@/"
 * tsconfig path alias.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aiWorkforceAssessmentCampaign as campaign,
  AI_WORKFORCE_ASSESSMENT_CANONICAL,
  AI_WORKFORCE_ASSESSMENT_PATH,
  AI_WORKFORCE_ASSESSMENT_ROBOTS,
  AI_WORKFORCE_ASSESSMENT_SLUG,
  START_ASSESSMENT_HREF,
  START_ASSESSMENT_LABEL,
} from "../../content/campaigns/ai-workforce-capability-assessment";
import { site } from "../../content/site";
import { serializeCampaign, type CampaignCta, type CampaignSection } from "./types";
import { buildConversionPayload } from "./conversion";
import { appendParamsToHref, mergeParams, readAllowlistedParams } from "./params";

/** Collect every CTA declared anywhere in the campaign config. */
function allCtas(): CampaignCta[] {
  const out: CampaignCta[] = [campaign.nav.cta];
  for (const section of campaign.sections as CampaignSection[]) {
    const data = section.data as Record<string, unknown>;
    for (const key of ["primaryCta", "secondaryCta"]) {
      const cta = data[key] as CampaignCta | undefined;
      if (cta) out.push(cta);
    }
  }
  return out;
}

/** CTAs whose destination starts vygo's existing assessment flow. */
function assessmentStartCtas(): CampaignCta[] {
  return allCtas().filter((cta) => cta.href === START_ASSESSMENT_HREF);
}

// --- Route -----------------------------------------------------------------

test("campaign is addressable at the mission's route with a stable id", () => {
  assert.equal(AI_WORKFORCE_ASSESSMENT_SLUG, "ai-workforce-capability-assessment");
  assert.equal(AI_WORKFORCE_ASSESSMENT_PATH, "/ai-workforce-capability-assessment");
  assert.equal(campaign.id, AI_WORKFORCE_ASSESSMENT_SLUG);
  assert.equal(campaign.slug, AI_WORKFORCE_ASSESSMENT_SLUG);
  assert.equal(campaign.path, AI_WORKFORCE_ASSESSMENT_PATH);
});

test("hero H1 is a campaign-specific headline about evaluating AI production readiness", () => {
  const hero = campaign.sections.find((s) => s.type === "hero");
  assert.ok(hero && hero.type === "hero");
  const heading = hero.data.heading.toLowerCase();
  assert.match(heading, /evaluat/);
  assert.match(heading, /production readiness|readiness/);
  assert.notEqual(heading.trim(), "");
});

test("page has the four substantive sections: value, benefits, proof, objection handling", () => {
  const serialized = serializeCampaign(campaign);
  // Assessment value (hero), concrete benefits, proof, and objection-handling FAQ.
  for (const required of ["hero", "benefits", "method", "faq", "closingCta"]) {
    assert.ok(serialized.enabled.includes(required as never), `missing section: ${required}`);
  }
  // At least four rendered sections.
  assert.ok(serialized.enabled.length >= 4);
  // A dedicated proof section distinct from the value/benefits grid.
  const proof = campaign.sections.find((s) => s.id === "proof");
  assert.ok(proof, "expected a dedicated proof section");
});

// --- Proof integrity -------------------------------------------------------

test("every proof claim carries an identifiable source and no placeholder text", () => {
  const proof = campaign.sections.find((s) => s.id === "proof");
  assert.ok(proof && proof.type === "benefits");
  assert.ok(proof.data.items.length >= 3);
  for (const item of proof.data.items) {
    // Each proof card attributes the statistic to published market context.
    assert.match(item.body, /vygo\.ai\/why-vygo/);
    assert.match(item.body, /industry|market/i);
    // Framed as market context, never as a vygo outcome.
    assert.match(item.body, /not a vygo outcome/i);
  }
  // No lorem/placeholder proof text anywhere in the config.
  const serialized = JSON.stringify(campaign);
  assert.doesNotMatch(serialized, /lorem|placeholder|tbd|todo|lipsum|xxxx/i);
});

// --- Single, repeated assessment-start action ------------------------------

test("exactly one assessment-start action, repeated at three distinct decision points", () => {
  const starts = assessmentStartCtas();
  // nav + hero + closing closing = three approved decision points, never more.
  assert.equal(starts.length, 3);
  assert.ok(starts.length <= 3);
  for (const cta of starts) {
    assert.equal(cta.label, START_ASSESSMENT_LABEL);
    assert.equal(cta.href, START_ASSESSMENT_HREF);
  }
  // The three live on the nav, the hero, and the closing band.
  assert.equal(campaign.nav.cta.href, START_ASSESSMENT_HREF);
  const hero = campaign.sections.find((s) => s.type === "hero");
  const closing = campaign.sections.find((s) => s.type === "closingCta");
  assert.ok(hero && hero.type === "hero" && hero.data.primaryCta.href === START_ASSESSMENT_HREF);
  assert.ok(
    closing &&
      closing.type === "closingCta" &&
      closing.data.primaryCta.href === START_ASSESSMENT_HREF,
  );
});

test("secondary CTAs are in-page anchors, not competing assessment-start actions", () => {
  const secondary = allCtas().filter((cta) => cta.href !== START_ASSESSMENT_HREF);
  assert.ok(secondary.length > 0);
  for (const cta of secondary) {
    assert.match(cta.href, /^#/); // same-page anchor, keeps one dominant action
  }
});

test("the assessment-start destination is the existing same-origin Readiness Check flow", () => {
  // Relative + same-origin so the conversion layer can append attribution, and
  // it lands on the pre-existing /readiness assessment (not a net-new flow).
  assert.equal(START_ASSESSMENT_HREF, "/readiness");
  assert.ok(START_ASSESSMENT_HREF.startsWith("/"));
  assert.ok(!START_ASSESSMENT_HREF.startsWith("//"));
});

// --- Metadata --------------------------------------------------------------

test("metadata is non-empty and differs from the home page", () => {
  assert.ok(campaign.meta.title.length > 0);
  assert.ok(campaign.meta.description.length > 0);
  assert.notEqual(campaign.meta.title, site.metadata.homeTitle);
  assert.notEqual(campaign.meta.description, site.metadata.homeDescription);
});

test("canonical is the campaign's final HTTPS URL", () => {
  assert.equal(campaign.meta.canonical, "https://www.vygo.ai/ai-workforce-capability-assessment");
  assert.equal(campaign.meta.canonical, AI_WORKFORCE_ASSESSMENT_CANONICAL);
  assert.ok(campaign.meta.canonical.startsWith("https://"));
  assert.ok(campaign.meta.canonical.endsWith(AI_WORKFORCE_ASSESSMENT_PATH));
});

test("Open Graph and social-card metadata are fully populated", () => {
  assert.ok(campaign.meta.ogTitle.length > 0);
  assert.ok(campaign.meta.ogDescription.length > 0);
  assert.match(campaign.meta.ogImage, /^https:\/\//);
  assert.ok(campaign.meta.ogImageAlt.length > 0);
});

test("robots policy is explicitly index,follow", () => {
  assert.deepEqual(AI_WORKFORCE_ASSESSMENT_ROBOTS, { index: true, follow: true });
});

// --- Analytics identity ----------------------------------------------------

test("conversion payloads carry the stable page id and a distinct CTA location", () => {
  const seen = new Set<string>();
  for (const cta of assessmentStartCtas()) {
    // The shell wires nav/hero/closing to these stable cta_location values.
    void cta;
  }
  for (const ctaLocation of ["nav_primary", "hero_primary", "closing_primary"]) {
    const payload = buildConversionPayload({
      event: "primary_cta_activation",
      landingPageId: campaign.id,
      ctaLocation,
      outcome: "activated",
      params: {},
    });
    assert.equal(payload.landing_page_id, "ai-workforce-capability-assessment");
    assert.equal(payload.cta_location, ctaLocation);
    assert.ok(!seen.has(ctaLocation), "cta_location values must be distinct");
    seen.add(ctaLocation);
  }
  assert.equal(seen.size, 3);
});

test("a landing_page_view carries the stable campaign page identifier", () => {
  const payload = buildConversionPayload({
    event: "landing_page_view",
    landingPageId: campaign.id,
    ctaLocation: null,
    outcome: "view",
    params: {},
  });
  assert.equal(payload.landing_page_id, "ai-workforce-capability-assessment");
  assert.equal(payload.cta_location, null);
});

// --- Attribution preservation ----------------------------------------------

test("campaign + custom attribution params are read and preserved onto the assessment start", () => {
  const url =
    "?utm_source=google&utm_medium=cpc&utm_campaign=workforce-capability&utm_content=variant-a&gclid=CjwABC123";
  const incoming = readAllowlistedParams(url);
  assert.equal(incoming.utm_source, "google");
  assert.equal(incoming.utm_medium, "cpc");
  assert.equal(incoming.utm_campaign, "workforce-capability");
  assert.equal(incoming.utm_content, "variant-a");
  // gclid is the custom (non-UTM) attribution parameter carried by the stack.
  assert.equal(incoming.gclid, "CjwABC123");

  const merged = mergeParams({}, incoming);
  const handoff = appendParamsToHref(START_ASSESSMENT_HREF, merged);
  assert.ok(handoff.startsWith("/readiness?"));
  for (const kv of [
    "utm_source=google",
    "utm_medium=cpc",
    "utm_campaign=workforce-capability",
    "utm_content=variant-a",
    "gclid=CjwABC123",
  ]) {
    assert.ok(handoff.includes(kv), `handoff URL missing ${kv}: ${handoff}`);
  }
});

test("a newer explicit param on the handoff is never overwritten by an older session value", () => {
  const stored = { utm_source: "old", gclid: "old-id" };
  const withExplicit = appendParamsToHref("/readiness?utm_source=fresh", mergeParams(stored, {}));
  // Fresh explicit utm_source wins; the older stored gclid still rides along.
  assert.ok(withExplicit.includes("utm_source=fresh"));
  assert.ok(!withExplicit.includes("utm_source=old"));
  assert.ok(withExplicit.includes("gclid=old-id"));
});

test("in-page anchor CTAs never receive attribution query params", () => {
  const params = { utm_source: "google", gclid: "abc" };
  assert.equal(appendParamsToHref("#how-it-works", params), "#how-it-works");
});

// --- Responsive / structural safety ----------------------------------------

test("nav is reduced and links are same-page anchors (no horizontal nav sprawl)", () => {
  assert.equal(campaign.nav.homeHref, "/");
  for (const link of campaign.nav.links) {
    assert.match(link.href, /^#/);
  }
});

test("serialized descriptor mirrors the rendered section order for verification", () => {
  const serialized = serializeCampaign(campaign);
  assert.deepEqual(
    serialized.order,
    campaign.sections.map((s) => s.type),
  );
  assert.deepEqual(serialized.enabled, serialized.order);
  assert.equal(serialized.campaignId, "ai-workforce-capability-assessment");
  assert.equal(serialized.path, "/ai-workforce-capability-assessment");
});
