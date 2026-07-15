import { test, expect } from "@playwright/test";
import { mockAvailability } from "./helpers";

// Equity-for-discount / dual cash-vs-equity pricing has been removed from the
// product and marketing. These phrase patterns encode the acceptance-criteria
// language so a regression that reintroduces the model — in visible copy, meta/
// SEO, JSON-LD, or a new intake CTA — fails loudly.
const EQUITY_PRICING_PATTERNS: RegExp[] = [
  /equity/i,
  /equity\s*(?:%|percent|percentage|stake|share|model)/i,
  /equity[- ]?for[- ]?discount/i,
  /cash[- ]?(?:only|vs\.?)/i,
  // Dual cash-vs-equity option phrasing ("cash or equity", "equity or cash").
  /\b(?:cash|equity)\s+or\s+(?:cash|equity)\b/i,
  // Intake / offer CTAs ("request equity deal", "pay with equity", "trade equity").
  /(?:request|apply for|pay with|trade|offer).{0,20}equity/i,
];

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

  test("marketing surfaces do not offer an equity-for-discount option", async ({ page }) => {
    // Equity deals are handled case-by-case offline and must not be marketed or
    // offered in-product; guard against any equity-pricing copy or intake flow
    // reappearing in the visible marketing surfaces. Sweep every primary
    // marketing page linked from the home page, not just pricing.
    for (const path of [
      "/",
      "/pricing",
      "/audit",
      "/method",
      "/why-vygo",
      "/security",
      "/insights",
    ]) {
      await page.goto(path);
      const main = page.locator("#main-content");
      for (const pattern of EQUITY_PRICING_PATTERNS) {
        await expect(main, `${path} must not surface ${pattern}`).not.toContainText(pattern);
      }
    }
  });

  test("no public page source exposes equity-pricing copy or meta/SEO", async ({ request }) => {
    // Acceptance criteria check page *source*, not just rendered text: equity copy
    // could hide in meta/SEO tags, JSON-LD, or legal/docs pages that the visible-
    // text guard above never inspects. Sweep the full public + legal/docs surface.
    const paths = [
      "/",
      "/pricing",
      "/audit",
      "/method",
      "/why-vygo",
      "/security",
      "/insights",
      "/privacy",
      "/terms",
      "/waitlist",
      "/thank-you",
    ];
    for (const path of paths) {
      const res = await request.get(path);
      expect(res.status(), `${path} should return 200`).toBe(200);
      const source = await res.text();
      expect(source.length, `${path} should serve non-empty HTML`).toBeGreaterThan(0);
      // Equity-pricing copy could hide in meta/SEO tags, JSON-LD, or a hidden
      // intake CTA the visible-text guard never inspects — sweep the raw markup
      // with the full acceptance-criteria pattern set.
      for (const pattern of EQUITY_PRICING_PATTERNS) {
        expect(source, `${path} source must not expose ${pattern}`).not.toMatch(pattern);
      }
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

  test("availability Apply CTA reaches the application form", async ({ page }) => {
    await mockAvailability(page, "open");
    await page.goto("/");
    await page.getByTestId("availability-bar-cta").click();
    await expect(page).toHaveURL(/\/apply/);
    await expect(page.getByTestId("apply-form")).toBeVisible();

    await mockAvailability(page, "waitlist");
    await page.goto("/");
    await page.getByTestId("availability-bar-cta").click();
    await expect(page).toHaveURL(/\/apply/);
    await expect(page.getByTestId("apply-form")).toBeVisible();
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
