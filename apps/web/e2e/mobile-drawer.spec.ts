import { test, expect, type Locator, type Page } from "@playwright/test";

/**
 * Regression guard: the mobile menu drawer must never silently re-render empty.
 *
 * Background: the drawer previously regressed to an empty panel (toggle + close
 * visible, primary nav links and Apply CTA clipped/missing). This test derives
 * the expected link set from the desktop primary header nav so the assertion
 * stays aligned with the live IA, then opens the hamburger at a mobile
 * viewport and requires every primary link plus the Apply CTA to be present
 * and actually visible (non-zero box, not display:none / hidden).
 */

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };

type NavLink = { href: string; label: string };

async function readDesktopPrimaryNavLinks(page: Page): Promise<NavLink[]> {
  // Desktop Primary nav stays in the DOM at all widths (hidden via CSS on
  // mobile). Read it as the source of truth for expected drawer contents.
  const links = await page.locator('nav[aria-label="Primary"] a').evaluateAll((anchors) =>
    anchors
      .filter((a) => a.getAttribute("data-testid") !== "desktop-primary-cta")
      .map((a) => ({
        href: a.getAttribute("href") ?? "",
        label: (a.textContent ?? "").trim(),
      }))
      .filter((item) => item.href.length > 0 && item.label.length > 0),
  );
  return links;
}

async function assertVisibleWithSize(locator: Locator, description: string) {
  await expect(locator, `${description} must be visible`).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${description} must have a rendered box`).toBeTruthy();
  expect(box!.width, `${description} must have non-zero width`).toBeGreaterThan(0);
  expect(box!.height, `${description} must have non-zero height`).toBeGreaterThan(0);
}

test.describe("Mobile nav drawer population guard", () => {
  test("opened drawer contains primary nav links and Apply CTA, all visible", async ({
    page,
  }, testInfo) => {
    // Focused guard runs under the mobile Playwright project (and can also be
    // forced via an explicit mobile viewport when projects differ).
    test.skip(
      testInfo.project.name !== "mobile" && testInfo.project.name !== "desktop",
      "mobile-drawer guard runs on mobile + desktop projects only",
    );

    // --- Desktop: capture the primary header nav contract ---
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/");
    await expect(page.locator("#main-content")).toBeVisible();

    const expectedLinks = await readDesktopPrimaryNavLinks(page);
    expect(
      expectedLinks.length,
      "desktop primary nav must expose at least one link to guard against",
    ).toBeGreaterThan(0);

    // Desktop primary nav must still render visibly at desktop widths
    // (acceptance: existing desktop nav unchanged).
    const desktopNav = page.getByRole("navigation", { name: "Primary" });
    await expect(desktopNav).toBeVisible();
    for (const item of expectedLinks) {
      const link = desktopNav.getByRole("link", { name: item.label, exact: true });
      await assertVisibleWithSize(link, `desktop nav link "${item.label}"`);
    }
    const desktopCta = page.getByTestId("desktop-primary-cta");
    await assertVisibleWithSize(desktopCta, "desktop Apply CTA");
    await expect(desktopCta).toContainText(/Apply/i);

    // --- Mobile: open the drawer and assert the same primary set + Apply CTA ---
    await page.setViewportSize(MOBILE_VIEWPORT);
    // Re-evaluate layout after the breakpoint change.
    await expect(page.getByTestId("mobile-nav-toggle")).toBeVisible();
    await expect(desktopNav).toBeHidden();

    const toggle = page.getByTestId("mobile-nav-toggle");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    const drawer = page.getByTestId("mobile-navigation");
    await expect(drawer, "mobile drawer must open").toBeVisible();

    // Never empty: at least as many primary nav links as the desktop header.
    const drawerNavLinks = drawer.locator('nav[aria-label="Mobile"] a');
    // Apply CTA may be a link or button depending on availability state.
    const drawerCta = drawer.getByTestId("mobile-primary-cta");

    const linkCount = await drawerNavLinks.count();
    expect(
      linkCount,
      "drawer must contain at least the desktop primary nav link count (empty-drawer regression)",
    ).toBeGreaterThanOrEqual(expectedLinks.length);

    for (const item of expectedLinks) {
      const link = drawer.getByRole("link", { name: item.label, exact: true });
      await expect(link, `drawer must include nav link "${item.label}"`).toHaveCount(1);
      await assertVisibleWithSize(link, `drawer nav link "${item.label}"`);
      const text = (await link.innerText()).trim();
      expect(
        text.length,
        `drawer nav link "${item.label}" must have a non-empty label`,
      ).toBeGreaterThan(0);
      if (item.href.startsWith("/")) {
        await expect(link).toHaveAttribute("href", item.href);
      }
    }

    await expect(drawerCta, "drawer must include the Apply CTA").toHaveCount(1);
    await assertVisibleWithSize(drawerCta, "drawer Apply CTA");
    await expect(drawerCta).toContainText(/Apply/i);
    const ctaLabel = (await drawerCta.innerText()).trim();
    expect(ctaLabel.length, "Apply CTA must have a non-empty label").toBeGreaterThan(0);
  });
});
