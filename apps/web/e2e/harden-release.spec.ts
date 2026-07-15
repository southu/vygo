import { test, expect, type Page } from "@playwright/test";
import { mockAvailability } from "./helpers";
import { pricingContent } from "../src/content/pricing";
import { homepage } from "../src/content/homepage";
import { hardenInquiryCopy } from "../src/content/inquiry-offers";

/**
 * Locks the customer-facing vygo Harden release surface:
 * homepage callout placement, /pricing #harden section, inquiry preselection,
 * naming, fixed price/duration, and no dedicated Harden nav/page.
 */
const HARDEN = pricingContent.harden;
const CALLOUT = homepage.pricingPreview.hardenCallout;

/** Claims that must not appear as Harden *inclusions* (fuller-engagement list is OK). */
const PROHIBITED_INCLUSION_CLAIMS = [
  /enterprise-grade/i,
  /guaranteed qualification/i,
  /penetration test/i,
  /pen(?:etration)?[- ]?test/i,
  /advanced SSO/i,
  /complex migration/i,
  /major product development/i,
];

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    return Math.max(doc.scrollWidth, body.scrollWidth) > Math.ceil(window.innerWidth) + 1;
  });
  expect(overflow, "page must not horizontally overflow the viewport").toBe(false);
}

test.describe("vygo Harden release", () => {
  test.beforeEach(async ({ page }) => {
    await mockAvailability(page, "open");
  });

  test("homepage has exactly one Harden callout after engagement cards and before security", async ({
    page,
  }) => {
    await page.goto("/");
    const main = page.locator("#main-content");

    const callouts = main.locator('[data-section="harden-callout"]');
    await expect(callouts).toHaveCount(1);

    const callout = callouts.first();
    await expect(callout).toBeVisible();
    await expect(callout).toContainText("vygo Harden");
    await expect(callout).toContainText(CALLOUT.offerLine);
    await expect(callout).toContainText(HARDEN.bestFor);
    await expect(callout.getByRole("link", { name: CALLOUT.cta.label })).toHaveAttribute(
      "href",
      "/pricing#harden",
    );

    // Document order: engagement-tiers → harden-callout → security heading
    const order = await page.evaluate(() => {
      const tiers = document.querySelector('[data-section="engagement-tiers"]');
      const harden = document.querySelector('[data-section="harden-callout"]');
      const securityHeading = Array.from(document.querySelectorAll("#main-content h2")).find((el) =>
        /Security is not a handoff checklist/i.test(el.textContent ?? ""),
      );
      if (!tiers || !harden || !securityHeading) return null;
      const position = tiers.compareDocumentPosition(harden);
      const afterTiers = (position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      const beforeSecurity =
        (harden.compareDocumentPosition(securityHeading) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      return { afterTiers, beforeSecurity };
    });
    expect(order).toEqual({ afterTiers: true, beforeSecurity: true });

    // Launch / Scale / Enterprise tier names remain on the homepage cards
    const tiers = main.locator('[data-section="engagement-tiers"]');
    await expect(tiers.getByRole("heading", { name: "Launch", exact: true })).toBeVisible();
    await expect(tiers.getByRole("heading", { name: "Scale", exact: true })).toBeVisible();
    await expect(tiers.getByRole("heading", { name: "Enterprise", exact: true })).toBeVisible();

    await assertNoHorizontalOverflow(page);
  });

  test("pricing has one #harden section before Production Readiness Audit", async ({ page }) => {
    await page.goto("/pricing");
    const main = page.locator("#main-content");

    await expect(main.locator("#harden")).toHaveCount(1);
    const harden = main.locator("#harden");
    await expect(harden).toBeVisible();
    await expect(harden).toHaveAttribute("data-section", "harden");

    await expect(harden).toContainText(HARDEN.name);
    await expect(harden).toContainText(HARDEN.priceLabel);
    await expect(harden).toContainText(HARDEN.duration);
    await expect(harden).toContainText(HARDEN.headline);

    // Price/duration contract
    await expect(harden).toContainText("$9,500");
    await expect(harden.getByText(/about two weeks/i)).toBeVisible();

    // Harden section appears before the Production Readiness Audit section
    const order = await page.evaluate(() => {
      const hardenEl = document.querySelector("#harden");
      const auditEl = document.querySelector("#production-readiness-audit");
      if (!hardenEl || !auditEl) return null;
      return (hardenEl.compareDocumentPosition(auditEl) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    });
    expect(order).toBe(true);

    await expect(main.locator("#production-readiness-audit")).toContainText(
      "Production Readiness Audit",
    );
    await expect(main.locator("#production-readiness-audit")).toContainText("$15K");

    // Build tiers and Ops names preserved
    await expect(main.getByRole("heading", { name: "Launch", exact: true })).toBeVisible();
    await expect(main.getByRole("heading", { name: "Scale", exact: true })).toBeVisible();
    await expect(main.getByRole("heading", { name: "Enterprise", exact: true })).toBeVisible();
    await expect(main).toContainText("vygo Ops");

    // Sales copy has no entity/legal-notice boilerplate (footer disclaimer stays elsewhere)
    const hardenText = await harden.innerText();
    expect(hardenText).not.toMatch(/VYGO LLC/i);
    expect(hardenText).not.toMatch(/operated by/i);
    expect(hardenText).not.toMatch(/Notices are effective when received/i);
    expect(hardenText).not.toMatch(/does not form a client relationship/i);

    // No overclaim that Harden *includes* enterprise-grade / pen-test / etc.
    // (Fuller-engagement exclusion list may mention related topics as out of scope.)
    const inclusionRegion = harden.locator("ul").filter({ hasText: /Team accounts and login/i });
    const inclusionText = await inclusionRegion.innerText();
    for (const pattern of PROHIBITED_INCLUSION_CLAIMS) {
      expect(inclusionText, `inclusion list must not claim ${pattern}`).not.toMatch(pattern);
    }
    expect(inclusionText).not.toMatch(/formal compliance/i);
    expect(hardenText).not.toMatch(/enterprise-grade/i);
    expect(hardenText).not.toMatch(/guaranteed qualification/i);

    await assertNoHorizontalOverflow(page);
  });

  test("no dedicated Harden page and no Harden nav item", async ({ page }, testInfo) => {
    const res = await page.request.get("/harden");
    // Static export 404 page or not-found — must not be a dedicated product page
    expect(res.status(), "/harden must not serve a dedicated product page").not.toBe(200);

    await page.goto("/");

    if (testInfo.project.name === "mobile") {
      await page.getByTestId("mobile-nav-toggle").click();
      const mobileNav = page.getByTestId("mobile-navigation");
      await expect(mobileNav.getByRole("link", { name: /^Harden$/i })).toHaveCount(0);
      await expect(mobileNav.getByRole("link", { name: /vygo Harden/i })).toHaveCount(0);
    } else {
      const desktopNav = page.getByRole("navigation", { name: "Primary" });
      await expect(desktopNav.getByRole("link", { name: /^Harden$/i })).toHaveCount(0);
      await expect(desktopNav.getByRole("link", { name: /vygo Harden/i })).toHaveCount(0);
    }
  });

  test("Harden CTAs and #harden anchors resolve with free assessment preselection", async ({
    page,
  }) => {
    // Homepage callout → pricing #harden
    await page.goto("/");
    await page
      .locator('[data-section="harden-callout"]')
      .getByRole("link", { name: CALLOUT.cta.label })
      .click();
    await expect(page).toHaveURL(/\/pricing#harden/);
    await expect(page.locator("#harden")).toBeVisible();

    // Pricing primary Harden CTA → waitlist with offer=harden
    const primaryCta = page.locator("#harden").getByTestId("apply-cta").first();
    await expect(primaryCta).toHaveAttribute("data-inquiry-offer", "harden");
    await primaryCta.click();
    await expect(page).toHaveURL(/\/waitlist\?offer=harden/);

    await expect(page.getByRole("heading", { level: 1 })).toContainText(hardenInquiryCopy.heading);
    await expect(page.locator("#main-content")).toContainText(/free fit assessment/i);
    await expect(page.locator("#main-content")).toContainText(
      /not the \$15,000 Production Readiness Audit/i,
    );

    const offerSelect = page.getByTestId("waitlist-offer-select");
    await expect(offerSelect).toHaveValue("harden");
    await expect(offerSelect.locator('option[value="harden"]')).toHaveText(
      /vygo Harden assessment/i,
    );
    // Must not preselect the paid audit
    expect(await offerSelect.inputValue()).not.toBe("audit");

    // Customer-facing inquiry copy uses full "vygo Harden" product name
    const intro = await page.locator("#main-content").innerText();
    expect(intro).toMatch(/vygo Harden/);
    expect(intro).not.toMatch(/\bthe Harden scope\b/);

    await assertNoHorizontalOverflow(page);
  });

  test("footer disclaimer remains and standard non-Harden inquiry still works", async ({
    page,
  }) => {
    await page.goto("/pricing");
    const footer = page.locator("footer");
    await expect(footer.locator("p.max-w-md.text-xs").first()).toBeVisible();
    await expect(footer).toContainText(/signed agreement/i);

    // Standard waitlist without Harden offer still renders default flow
    await page.goto("/waitlist");
    await expect(page.getByTestId("waitlist-offer-select")).toHaveValue("");
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(hardenInquiryCopy.heading);

    // Primary nav Pricing remains reachable
    await page.goto("/");
    const pricingLink = page.getByRole("navigation", { name: "Primary" }).getByRole("link", {
      name: "Pricing",
    });
    // Desktop project only has Primary nav visible; mobile uses the drawer
    if (await pricingLink.isVisible()) {
      await pricingLink.click();
      await expect(page).toHaveURL(/\/pricing/);
    }
  });

  test("direct /pricing#harden and waitlist?offer=harden links are healthy", async ({
    request,
  }) => {
    for (const path of ["/", "/pricing", "/version", "/waitlist?offer=harden"]) {
      const res = await request.get(path);
      expect(res.status(), `${path} should return 200`).toBe(200);
    }
    const version = (await (await request.get("/version")).text()).trim();
    expect(version).toMatch(/^[0-9a-f]+$/i);
  });
});
