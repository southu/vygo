import { test, expect } from "@playwright/test";
import { brand } from "@vygo/ui";
import { homepage } from "../src/content/homepage";
import { ctas } from "../src/content/ctas";
import { mockAvailability } from "./helpers";

/**
 * Locks repository-approved homepage hero/footer copy so production copy
 * regressions (superseded legal language, wrong trust line, missing paragraphs)
 * fail in CI before deploy.
 */
const APPROVED_HERO = homepage.hero;
const SUPERSEDED_HERO_PHRASES = [
  /vygo\s*llc/i,
  /operated by VYGO LLC/i,
  /separately executed agreement with VYGO LLC/i,
  /Submitting does not form a client relationship/i,
  /Services begin only under a separately executed agreement/i,
  /Notices are effective when received/i,
];

test.describe("Homepage approved copy", () => {
  test.beforeEach(async ({ page }) => {
    await mockAvailability(page, "open");
  });

  test("hero renders the approved eyebrow, headline, body, trust line, and CTA", async ({
    page,
  }) => {
    await page.goto("/");
    const hero = page.locator('[data-section="hero"]');
    await expect(hero).toBeVisible();

    await expect(hero.locator(".eyebrow")).toHaveText(APPROVED_HERO.eyebrow);
    await expect(hero.locator("h1")).toHaveText(APPROVED_HERO.headline);

    const paragraphs = hero.locator(".max-w-xl p");
    await expect(paragraphs).toHaveCount(APPROVED_HERO.bodyParagraphs.length);
    for (let i = 0; i < APPROVED_HERO.bodyParagraphs.length; i++) {
      await expect(paragraphs.nth(i)).toHaveText(APPROVED_HERO.bodyParagraphs[i]);
    }

    await expect(hero.locator("p.text-sm.font-semibold").first()).toHaveText(
      APPROVED_HERO.proofLine,
    );
    await expect(hero.getByTestId("apply-cta")).toHaveText(ctas.applyNextOpening);
  });

  test("hero contains no VYGO LLC or superseded legal language", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator('[data-section="hero"]');
    const text = await hero.innerText();
    const html = await hero.innerHTML();

    for (const pattern of SUPERSEDED_HERO_PHRASES) {
      expect(text, `hero text must not match ${pattern}`).not.toMatch(pattern);
      expect(html, `hero markup must not match ${pattern}`).not.toMatch(pattern);
    }
  });

  test("prototype-to-production graphic keeps approved labels and message", async ({ page }) => {
    await page.goto("/");
    const figure = page.locator('[data-section="hero"] figure');
    await expect(figure).toBeVisible();

    // Labels use CSS uppercase; assert on textContent (source strings).
    await expect(figure).toContainText(APPROVED_HERO.validated.title);
    await expect(figure).toContainText(APPROVED_HERO.pipelineLabel);
    await expect(figure).toContainText(APPROVED_HERO.production.title);
    await expect(figure).toContainText(APPROVED_HERO.diagramCaption);

    for (const item of APPROVED_HERO.validated.items) {
      await expect(figure).toContainText(item);
    }
    for (const item of APPROVED_HERO.production.items) {
      await expect(figure).toContainText(item);
    }
  });

  test("footer shows the approved disclaimer and accessible email", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");

    await expect(footer.locator("p.max-w-md.text-xs").first()).toHaveText(brand.footerDisclaimer);
    await expect(footer).not.toContainText("Operated by VYGO LLC");
    await expect(footer).not.toContainText("Notices are effective when received");

    const email = footer.locator(`a[href="mailto:${brand.email}"]`);
    await expect(email).toHaveText(brand.email);
    await email.focus();
    await expect(email).toBeFocused();
  });

  test("primary CTA activates the approved waitlist destination", async ({ page }) => {
    await page.goto("/");
    const cta = page.locator('[data-section="hero"]').getByTestId("apply-cta");
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page).toHaveURL(/\/waitlist/);
  });
});

/**
 * Consumer marketing/product surfaces must never reintroduce entity operator
 * phrasing or the legal P-handoff boilerplate. Privacy and terms pages are
 * intentionally excluded — corporate entity language remains there only.
 */
const CONSUMER_PATHS = [
  "/",
  "/audit",
  "/method",
  "/security",
  "/why-vygo",
  "/pricing",
  "/waitlist",
  "/apply",
  "/thank-you",
  "/insights",
] as const;

const PROHIBITED_CONSUMER_PHRASES = [
  /operated by VYGO LLC/i,
  /VYGO LLC/i,
  /operated by/i,
  /separately executed agreement/i,
  /does not form a client relationship/i,
  /Services begin only under a separately executed agreement/i,
  /Notices are effective when received/i,
];

test.describe("Consumer surfaces: no entity or P-handoff legal language", () => {
  for (const path of CONSUMER_PATHS) {
    test(`${path} HTML source has no prohibited entity/handoff phrasing`, async ({
      request,
    }) => {
      const res = await request.get(path);
      expect(res.status(), `${path} must return HTTP 200`).toBe(200);
      const html = await res.text();
      for (const pattern of PROHIBITED_CONSUMER_PHRASES) {
        expect(html, `${path} must not match ${pattern}`).not.toMatch(pattern);
      }
    });
  }

  test("privacy and terms remain reachable with substantive legal content", async ({
    request,
  }) => {
    const privacy = await request.get("/privacy");
    expect(privacy.status()).toBe(200);
    const privacyHtml = await privacy.text();
    expect(privacyHtml).toMatch(/privacy/i);
    expect(privacyHtml.length).toBeGreaterThan(500);

    const terms = await request.get("/terms");
    expect(terms.status()).toBe(200);
    const termsHtml = await terms.text();
    expect(termsHtml).toMatch(/terms/i);
    expect(termsHtml.length).toBeGreaterThan(500);
  });
});
