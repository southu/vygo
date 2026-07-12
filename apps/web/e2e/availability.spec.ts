import { test, expect } from "@playwright/test";
import { mockAvailability } from "./helpers";

test.describe("Availability UI states", () => {
  test("open state shows enabled open-access CTA", async ({ page }) => {
    await mockAvailability(page, "open");
    await page.goto("/");
    const bar = page.locator('[data-availability-ui="bar"]');
    await expect(bar).toHaveAttribute("data-availability-state", "open");
    await expect(bar.locator("[data-availability-message]")).not.toBeEmpty();
    const cta = bar.locator('[data-availability-action="open-access"]');
    await expect(cta).toBeEnabled();
    await cta.click();
    await expect(page).toHaveURL(/\/waitlist/);
  });

  test("waitlist state opens WaitlistForm", async ({ page }) => {
    await mockAvailability(page, "waitlist");
    await page.goto("/");
    const bar = page.locator('[data-availability-ui="bar"]');
    await expect(bar).toHaveAttribute("data-availability-state", "waitlist");
    await bar.locator('[data-availability-action="open-waitlist"]').click();
    await expect(page.getByTestId("waitlist-modal")).toBeVisible();
    await expect(page.getByTestId("waitlist-form-heading")).toBeFocused();
  });

  test("paused state explains pause and has no submission action", async ({ page }) => {
    await mockAvailability(page, "paused");
    await page.goto("/waitlist");
    const card = page.locator('[data-availability-ui="card"]');
    await expect(card).toHaveAttribute("data-availability-state", "paused");
    await expect(card.locator("[data-paused-explanation]")).toBeVisible();
    await expect(card.locator('[data-availability-action="none"]')).toBeVisible();
    await expect(card.locator('[data-availability-action="open-waitlist"]')).toHaveCount(0);
    await expect(card.locator('[data-availability-action="open-access"]')).toHaveCount(0);

    // AC7: /waitlist page must not expose an enabled application form while paused.
    const pageForm = page.getByTestId("waitlist-page-form");
    await expect(pageForm).toHaveAttribute("data-form-gated", "paused");
    await expect(pageForm.locator("[data-paused-explanation]")).toBeVisible();
    await expect(pageForm.locator("[data-paused-explanation]")).toContainText(
      /not accepting new applications|Enrollment is paused/i,
    );
    await expect(pageForm.getByRole("heading", { name: /Enrollment paused/i })).toBeVisible();
    await expect(page.getByTestId("waitlist-form")).toHaveCount(0);
    await expect(page.getByTestId("waitlist-continue")).toHaveCount(0);
    await expect(page.getByTestId("waitlist-submit")).toHaveCount(0);
    await expect(page.getByTestId("waitlist-page-paused-cta")).toBeDisabled();
    // No enabled submit/continue controls anywhere on the page.
    const enabledSubmitControls = page.locator(
      'button:enabled[type="submit"], button:enabled[data-testid="waitlist-continue"], button:enabled[data-testid="waitlist-submit"]',
    );
    await expect(enabledSubmitControls).toHaveCount(0);
  });

  test("loading state is busy and not incorrectly actionable", async ({ page }) => {
    await mockAvailability(page, "delay", { delayMs: 8_000 });
    await page.goto("/");
    const bar = page.locator('[data-availability-ui="bar"]');
    await expect(bar).toHaveAttribute("data-availability-state", "loading", { timeout: 3_000 });
    await expect(bar).toHaveAttribute("aria-busy", "true");
    await expect(bar.locator('[data-availability-action="open-access"]')).toHaveCount(0);
    await expect(bar.locator('[data-availability-action="open-waitlist"]')).toHaveCount(0);
  });

  test("API failure shows fallback message and retry without crashing page", async ({ page }) => {
    await mockAvailability(page, "error");
    await page.goto("/");
    const bar = page.locator('[data-availability-ui="bar"]');
    await expect(bar).toHaveAttribute("data-availability-state", "error");
    await expect(bar.locator("[data-availability-message]")).not.toBeEmpty();
    await expect(bar.locator('[data-availability-action="retry"]')).toBeVisible();
    await expect(page.locator("#main-content")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("stale state retains last known data and offers refresh", async ({ page }) => {
    let n = 0;
    await page.route("**/v1/public/availability**", async (route) => {
      n += 1;
      if (n === 1) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              status: "waitlist",
              nextOpeningDate: "2026-09-15",
              engagementType: "audit",
              displayNote: "Note",
              availableStarts: null,
              updatedAt: new Date().toISOString(),
            },
          }),
        });
        return;
      }
      await route.abort("failed");
    });

    await page.goto("/");
    const bar = page.locator('[data-availability-ui="bar"]');
    await expect(bar).toHaveAttribute("data-availability-state", "waitlist");

    // Force stale UI while retaining last known payload
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__vygoAvailability?.markStale?.();
    });
    await expect(bar).toHaveAttribute("data-availability-state", "stale");
    await expect(bar.locator("text=Stale")).toBeVisible();
    await expect(bar.locator("[data-availability-message]")).toContainText(/waitlist|Last known/i);
    const retry = bar.locator('[data-availability-action="retry"]');
    await expect(retry).toBeVisible();

    // Retry triggers refresh (fails) → still retains last known (stale or error-with-data)
    await retry.click();
    await expect(bar).toHaveAttribute("data-availability-state", /stale|error|waitlist/);
    await expect(page.locator("#main-content")).toBeVisible();
  });
});
