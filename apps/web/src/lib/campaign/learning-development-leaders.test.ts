/**
 * Coverage for the L&D / enablement leaders landing page
 * (/learning-development-leaders): route, metadata, section structure, the
 * single on-page waitlist conversion, and material distinctness from Campaign 1
 * (the assessment page). Pure assertions against the campaign configuration —
 * no DOM or network — so the repository `pnpm test` command runs them.
 *
 * Relative imports throughout: the node:test runner does not resolve the "@/"
 * tsconfig path alias.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  learningDevelopmentLeadersCampaign as campaign,
  LEARNING_DEV_LEADERS_CANONICAL,
  LEARNING_DEV_LEADERS_PATH,
  LEARNING_DEV_LEADERS_ROBOTS,
  LEARNING_DEV_LEADERS_SLUG,
  APPLY_HREF,
} from "../../content/campaigns/learning-development-leaders";
import { aiWorkforceAssessmentCampaign as assessment } from "../../content/campaigns/ai-workforce-capability-assessment";
import { serializeCampaign, type CampaignCta, type CampaignSection } from "./types";

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

// --- Route -----------------------------------------------------------------

test("campaign is addressable at the mission's route with a stable id", () => {
  assert.equal(LEARNING_DEV_LEADERS_SLUG, "learning-development-leaders");
  assert.equal(LEARNING_DEV_LEADERS_PATH, "/learning-development-leaders");
  assert.equal(campaign.id, LEARNING_DEV_LEADERS_SLUG);
  assert.equal(campaign.slug, LEARNING_DEV_LEADERS_SLUG);
  assert.equal(campaign.path, LEARNING_DEV_LEADERS_PATH);
});

test("metadata is unique, canonical matches the production URL, robots is index,follow", () => {
  assert.equal(campaign.meta.canonical, LEARNING_DEV_LEADERS_CANONICAL);
  assert.equal(campaign.meta.canonical, "https://www.vygo.ai/learning-development-leaders");
  assert.ok(campaign.meta.title.trim().length > 0);
  assert.ok(campaign.meta.description.trim().length > 0);
  assert.deepEqual(LEARNING_DEV_LEADERS_ROBOTS, { index: true, follow: true });
});

// --- Section structure -----------------------------------------------------

test("exactly one hero (single H1) and every required persuasion section is present", () => {
  const heroes = campaign.sections.filter((s) => s.type === "hero");
  assert.equal(heroes.length, 1, "exactly one hero → exactly one H1");

  const ids = new Set(campaign.sections.map((s) => s.id));
  for (const required of ["problem", "value", "benefits", "proof", "objections", "waitlist"]) {
    assert.ok(ids.has(required), `missing required section: ${required}`);
  }

  // The waitlist application is the on-page conversion section.
  const waitlist = campaign.sections.find((s) => s.id === "waitlist");
  assert.ok(waitlist && waitlist.type === "waitlist", "waitlist section renders the on-page form");
});

// --- Single on-page waitlist conversion ------------------------------------

test("every prominent conversion CTA targets the same on-page waitlist form", () => {
  assert.equal(APPLY_HREF, "#waitlist");
  // The nav, hero, and closing conversion CTAs all point to the on-page form.
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

// --- Material distinctness from Campaign 1 (assessment) --------------------

test("landing page is materially distinct from the assessment landing page", () => {
  assert.notEqual(campaign.path, assessment.path);
  assert.notEqual(campaign.meta.canonical, assessment.meta.canonical);
  assert.notEqual(campaign.meta.title, assessment.meta.title);

  const h1 = (campaign.sections.find((s) => s.type === "hero") as { data: { heading: string } })
    .data.heading;
  const assessmentH1 = (
    assessment.sections.find((s) => s.type === "hero") as { data: { heading: string } }
  ).data.heading;
  assert.notEqual(h1, assessmentH1);

  // Assessment's primary action navigates to the readiness flow; this campaign
  // converts on its own on-page waitlist form.
  const assessmentPrimary = (
    assessment.sections.find((s) => s.type === "hero") as {
      data: { primaryCta: CampaignCta };
    }
  ).data.primaryCta.href;
  assert.notEqual(assessmentPrimary, APPLY_HREF);
  assert.ok(!campaign.sections.some((s) => s.type === "waitlist" && s.id === ""));
  assert.ok(assessment.sections.every((s) => s.type !== "waitlist"));
});

// --- Serialized descriptor -------------------------------------------------

test("serialized descriptor exposes the waitlist section in render order", () => {
  const serialized = serializeCampaign(campaign);
  assert.ok(serialized.enabled.includes("waitlist"));
  assert.equal(serialized.order[serialized.order.length - 1], "closingCta");
  assert.equal(serialized.campaignId, LEARNING_DEV_LEADERS_SLUG);
});
