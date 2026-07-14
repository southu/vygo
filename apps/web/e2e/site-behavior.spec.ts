import { test, expect } from "@playwright/test";
import { mockAvailability } from "./helpers";

test.describe("Site behavior preservation", () => {
  test("home page returns content", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/127\.0\.0\.1:8380|localhost/);
    await expect(page.locator("#main-content")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("version endpoint identifies commit", async ({ request }) => {
    const res = await request.get("/version");
    expect(res.status()).toBe(200);
    const text = (await res.text()).trim();
    expect(text.length).toBeGreaterThan(7);
    expect(text).toMatch(/^[0-9a-f]+$/i);
  });

  test("tier pricing is consistent on the home and pricing pages", async ({ page }) => {
    for (const path of ["/", "/pricing"]) {
      await page.goto(path);
      const main = page.locator("#main-content");

      await expect(main.getByText("From $75K", { exact: true })).toBeVisible();
      await expect(main.getByText("From $145K", { exact: true })).toBeVisible();
      await expect(main.getByText("$275K+", { exact: true })).toBeVisible();
      await expect(main).not.toContainText("From $95K");
      await expect(main).not.toContainText("From $185K");
      await expect(main).not.toContainText("$350K+");
    }
  });

  test("home and pricing pages do not market an equity-for-discount option", async ({ page }) => {
    // Equity deals are handled case-by-case offline and must not be marketed or
    // offered in-product; guard against any equity-pricing copy reappearing.
    for (const path of ["/", "/pricing"]) {
      await page.goto(path);
      const main = page.locator("#main-content");
      await expect(main).not.toContainText(/equity/i);
      await expect(main).not.toContainText(/cash[- ]?(?:only|vs\.?)/i);
    }
  });

  test("Why vygo.ai is discoverable and renders the complete marketing page", async ({
    page,
    request,
  }) => {
    await page.goto("/");

    const footerLink = page.locator("footer").getByRole("link", { name: "Why vygo.ai" });
    await expect(footerLink).toHaveAttribute("href", "/why-vygo");
    await footerLink.click();
    await expect(page).toHaveURL(/\/why-vygo$/);

    const whyPageFooterLink = page.locator("footer").getByRole("link", { name: "Why vygo.ai" });
    await expect(whyPageFooterLink).toHaveAttribute("href", "/why-vygo");

    await expect(page).toHaveTitle(/Why vygo\.ai/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.+/);

    const main = page.locator("#main-content");
    await expect(main.locator('section[data-section="hero"]')).toContainText("Why vygo.ai");
    await expect(main.locator('section[data-section="market"]')).toContainText("$4.7–7.4B");
    await expect(main.locator('section[data-section="providers"]')).toContainText(
      "Two types of providers",
    );
    await expect(
      main.getByRole("paragraph").filter({ hasText: /^Budget \/ tactical shops$/ }),
    ).toBeVisible();
    await expect(
      main.getByRole("paragraph").filter({ hasText: /^Production engineering firms$/ }),
    ).toBeVisible();
    await expect(main.locator('section[data-section="comparison"] table')).toBeVisible();
    await expect(main.locator('section[data-section="claims"] li')).toHaveCount(4);
    await expect(main.locator('section[data-section="cta"]')).toContainText(
      "Apply for the next opening",
    );

    const internalHrefs = await page
      .locator('header a[href^="/"], main a[href^="/"], footer a[href^="/"]')
      .evaluateAll((links) =>
        [...new Set(links.map((link) => link.getAttribute("href")))].filter(Boolean),
      );

    for (const href of internalHrefs) {
      const response = await request.get(href!);
      expect(response.status(), `${href} should resolve`).toBe(200);
    }
  });

  test("pricing update preserves audit, ops, and engagement terms", async ({ page }) => {
    await page.goto("/pricing");
    const main = page.locator("#main-content");

    await expect(main).toContainText("$15K");
    await expect(main).toContainText("$8K/month");
    await expect(main).toContainText("$15K/month");
    await expect(main).toContainText("$25K/month");
    await expect(main).toContainText("6–8 weeks");
    await expect(main).toContainText("10–14 weeks");
    await expect(main).toContainText("16–20+ weeks");
    await expect(main).toContainText("Full IP handoff");
  });

  test("primary CTAs reach open-access or waitlist form", async ({ page }) => {
    await mockAvailability(page, "open");
    await page.goto("/");
    await page.getByTestId("availability-bar-cta").click();
    await expect(page).toHaveURL(/\/waitlist/);

    await mockAvailability(page, "waitlist");
    await page.goto("/");
    await page.getByTestId("availability-bar-cta").click();
    await expect(page.getByTestId("waitlist-modal")).toBeVisible();
  });

  test("mobile nav keyboard open/close, expanded state, no trap, links work", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "mobile project only");
    await page.goto("/");
    const toggle = page.getByTestId("mobile-nav-toggle");
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("mobile-navigation")).toBeVisible();

    // Focus can leave the panel (no trap): Tab enough times then Escape
    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toBeFocused();

    await toggle.click();
    await page.getByTestId("mobile-navigation").getByRole("link", { name: "Audit" }).click();
    await expect(page).toHaveURL(/\/audit/);
  });

  test("Why vygo.ai is reachable through viewport-specific primary navigation", async ({
    page,
  }, testInfo) => {
    await page.goto("/");

    if (testInfo.project.name === "mobile") {
      await page.getByTestId("mobile-nav-toggle").click();
      await page
        .getByTestId("mobile-navigation")
        .getByRole("link", { name: "Why vygo.ai" })
        .click();
    } else {
      await page
        .getByRole("navigation", { name: "Primary" })
        .getByRole("link", { name: "Why vygo.ai" })
        .click();
    }

    await expect(page).toHaveURL(/\/why-vygo$/);
    await expect(page.locator('main section[data-section="hero"]')).toBeVisible();
  });

  test("FAQ toggles by mouse and keyboard with aria relationships", async ({ page }) => {
    await page.goto("/");
    const faqSection = page
      .locator("#main-content")
      .locator("section")
      .filter({
        has: page.getByRole("heading", { name: /Frequently asked questions/i }),
      });
    const buttons = faqSection.getByRole("button");
    const first = buttons.first();
    const controls = await first.getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    const expanded = await first.getAttribute("aria-expanded");
    // Toggle via click
    await first.click();
    const afterClick = await first.getAttribute("aria-expanded");
    expect(afterClick).not.toBe(expanded);
    // Panel relationship
    const panel = page.locator(`#${controls}`);
    if (afterClick === "true") {
      await expect(panel).toBeVisible();
    }
    // Keyboard
    await first.focus();
    await page.keyboard.press("Enter");
    const afterKey = await first.getAttribute("aria-expanded");
    expect(afterKey).toBe(expanded);
  });

  test("non-waitlist navigation still works", async ({ page }, testInfo) => {
    await page.goto("/");
    if (testInfo.project.name === "mobile") {
      await page.getByTestId("mobile-nav-toggle").click();
      await page.getByTestId("mobile-navigation").getByRole("link", { name: "Method" }).click();
      await expect(page).toHaveURL(/\/method/);
      await page.getByTestId("mobile-nav-toggle").click();
      await page.getByTestId("mobile-navigation").getByRole("link", { name: "Security" }).click();
      await expect(page).toHaveURL(/\/security/);
    } else {
      await page
        .getByRole("navigation", { name: "Primary" })
        .getByRole("link", { name: "Method" })
        .click();
      await expect(page).toHaveURL(/\/method/);
      await page
        .getByRole("navigation", { name: "Primary" })
        .getByRole("link", { name: "Security" })
        .click();
      await expect(page).toHaveURL(/\/security/);
    }
  });
});
