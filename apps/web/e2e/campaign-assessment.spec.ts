import { test, expect } from "@playwright/test";

/**
 * Critical-flow coverage for the AI production-readiness assessment landing
 * page (/ai-workforce-capability-assessment): the route resolves, the single
 * dominant assessment-start action reaches the existing /readiness flow with
 * attribution preserved, the page is usable at a 390px mobile viewport with no
 * horizontal overflow, and the metadata/robots contract is present in source.
 */
const ROUTE = "/ai-workforce-capability-assessment";
const CANONICAL = "https://www.vygo.ai/ai-workforce-capability-assessment";

test.describe("AI production-readiness assessment landing", () => {
  test("route and home both return 200", async ({ request }) => {
    expect((await request.get(ROUTE)).status()).toBe(200);
    // The pre-existing home and assessment routes stay operable.
    expect((await request.get("/")).status()).toBe(200);
    expect((await request.get("/readiness")).status()).toBe(200);
  });

  test("renders a campaign H1 about evaluating readiness and the core sections", async ({
    page,
  }) => {
    await page.goto(ROUTE);
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toContainText(/evaluat/i);
    // Stable campaign identifier exposed in the DOM.
    await expect(
      page.locator("[data-campaign-id='ai-workforce-capability-assessment']"),
    ).toHaveCount(1);
    // Value, benefits, proof, and objection-handling sections all render.
    await expect(page.locator("[data-campaign-section='hero']")).toHaveCount(1);
    await expect(page.locator("[data-campaign-section='benefits']").first()).toBeVisible();
    await expect(page.locator("[data-campaign-section='faq']")).toHaveCount(1);
  });

  test("one dominant assessment-start action, repeated at three decision points", async ({
    page,
  }) => {
    await page.goto(ROUTE);
    const starts = page.locator("a[href^='/readiness']");
    await expect(starts).toHaveCount(3);
    // The primary hero action is enabled and keyboard focusable.
    const heroCta = page
      .locator("[data-cta-location='hero_primary'] a[href^='/readiness']")
      .first();
    await expect(heroCta).toBeVisible();
    await heroCta.focus();
    await expect(heroCta).toBeFocused();
  });

  test("preserves campaign + custom attribution params onto the assessment start", async ({
    page,
  }) => {
    await page.goto(
      `${ROUTE}?utm_source=google&utm_medium=cpc&utm_campaign=workforce-capability&utm_content=variant-a&gclid=CjwABC123`,
    );
    const heroCta = page
      .locator("[data-cta-location='hero_primary'] a[href^='/readiness']")
      .first();
    // After hydration the CTA href carries the preserved attribution params.
    await expect
      .poll(async () => (await heroCta.getAttribute("href")) ?? "")
      .toContain("utm_source=google");
    const href = (await heroCta.getAttribute("href")) ?? "";
    for (const kv of [
      "utm_medium=cpc",
      "utm_campaign=workforce-capability",
      "utm_content=variant-a",
      "gclid=CjwABC123",
    ]) {
      expect(href).toContain(kv);
    }
  });

  test("assessment-start reaches the existing /readiness flow with params intact", async ({
    page,
  }) => {
    await page.goto(`${ROUTE}?utm_source=google&gclid=CjwABC123`);
    const heroCta = page
      .locator("[data-cta-location='hero_primary'] a[href^='/readiness']")
      .first();
    await expect
      .poll(async () => (await heroCta.getAttribute("href")) ?? "")
      .toContain("utm_source=google");
    await heroCta.click();
    await expect(page).toHaveURL(/\/readiness/);
    await expect(page).toHaveURL(/utm_source=google/);
    await expect(page).toHaveURL(/gclid=CjwABC123/);
    // The assessment flow itself renders (no dead end / blocking error).
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("no horizontal overflow at a 390px mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ROUTE);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    // Assessment-start controls stay visible at mobile width.
    await expect(
      page.locator("[data-cta-location='hero_primary'] a[href^='/readiness']").first(),
    ).toBeVisible();
  });

  test("declares indexable metadata: canonical, robots, Open Graph, and Twitter card", async ({
    page,
  }) => {
    await page.goto(ROUTE);
    await expect(page.locator("link[rel='canonical']")).toHaveAttribute("href", CANONICAL);
    await expect(page.locator("meta[name='robots']")).toHaveAttribute("content", /index/i);
    await expect(page.locator("meta[name='robots']")).toHaveAttribute("content", /follow/i);
    await expect(page.locator("meta[property='og:title']")).toHaveCount(1);
    await expect(page.locator("meta[property='og:description']")).toHaveCount(1);
    await expect(page.locator("meta[property='og:url']")).toHaveCount(1);
    await expect(page.locator("meta[property='og:image']")).toHaveCount(1);
    await expect(page.locator("meta[name='twitter:card']")).toHaveCount(1);
    await expect(page.locator("meta[name='twitter:title']")).toHaveCount(1);
    await expect(page.locator("meta[name='twitter:description']")).toHaveCount(1);
    await expect(page.locator("meta[name='twitter:image']")).toHaveCount(1);
    // The Twitter/X card image must carry non-empty alt text so it is not
    // announced without a description (parity with the Open Graph image).
    await expect(page.locator("meta[name='twitter:image:alt']")).toHaveCount(1);
    await expect(page.locator("meta[name='twitter:image:alt']")).not.toHaveAttribute("content", "");
    await expect(page.locator("meta[property='og:image:alt']")).toHaveCount(1);
  });
});
