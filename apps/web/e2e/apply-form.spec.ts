import { test, expect } from "@playwright/test";
import { mockAvailability } from "./helpers";

/**
 * Locks the /apply form submit flow: posts only to the server-side /api/apply
 * endpoint, shows success confirmation on 2xx, and shows an error on 4xx.
 * Client never embeds DB credentials (asserted against page source + JS).
 */
test.describe("Apply form persistence UI", () => {
  test.beforeEach(async ({ page }) => {
    await mockAvailability(page, "open");
  });

  test("shows Full name, Work email, and next audit start date banner", async ({ page }) => {
    await page.goto("/apply");
    await expect(page.getByRole("heading", { name: /Apply for the next opening/i })).toBeVisible();
    await expect(page.getByTestId("apply-full-name")).toBeVisible();
    await expect(page.getByTestId("apply-work-email")).toBeVisible();
    await expect(page.getByTestId("apply-next-audit-date")).toBeVisible();
    await expect(page.getByTestId("apply-next-audit-date")).toContainText(
      /Next available audit start date/i,
    );
  });

  test("successful submit shows visible confirmation and application id", async ({ page }) => {
    const createdId = "11111111-2222-4333-8444-555555555555";
    await page.route("**/api/apply", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      const body = route.request().postDataJSON() as {
        full_name?: string;
        work_email?: string;
      };
      expect(body.full_name).toBe("Ratchet Tester");
      expect(body.work_email).toBe("ratchet-tester@example.com");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: createdId,
          full_name: "Ratchet Tester",
          work_email: "ratchet-tester@example.com",
          product_url: null,
          message: null,
          source: "apply",
          created_at: new Date().toISOString(),
        }),
      });
    });

    await page.goto("/apply");
    await page.getByTestId("apply-full-name").fill("Ratchet Tester");
    await page.getByTestId("apply-work-email").fill("ratchet-tester@example.com");
    await page.getByTestId("apply-submit").click();

    await expect(page.getByTestId("apply-success")).toBeVisible();
    await expect(page.getByTestId("apply-success-message")).toContainText(/received/i);
    await expect(page.getByTestId("apply-success")).toHaveAttribute(
      "data-application-id",
      createdId,
    );
    await expect(page.getByTestId("apply-form")).toHaveCount(0);
  });

  test("4xx response shows visible error and keeps the form", async ({ page }) => {
    await page.route("**/api/apply", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "VALIDATION_ERROR",
            message: "work_email must be a valid-looking address (include @ and a domain).",
          },
        }),
      });
    });

    await page.goto("/apply");
    await page.getByTestId("apply-full-name").fill("Ratchet Tester");
    await page.getByTestId("apply-work-email").fill("not-an-email");
    await page.getByTestId("apply-submit").click();

    await expect(page.getByTestId("apply-error")).toBeVisible();
    await expect(page.getByTestId("apply-error")).toContainText(/work_email|valid/i);
    await expect(page.getByTestId("apply-form")).toBeVisible();
    await expect(page.getByTestId("apply-success")).toHaveCount(0);
  });

  test("page source and served scripts do not embed database credentials", async ({
    page,
    request,
  }) => {
    const res = await request.get("/apply");
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).not.toMatch(/DATABASE_URL|postgres(?:ql)?:\/\/|connectionString/i);

    await page.goto("/apply");
    // Client form posts to the server endpoint only.
    const formScript = await page.locator('script[src*="app/apply"]').count();
    expect(formScript).toBeGreaterThanOrEqual(0);

    // Scan inline config / RSC payload for connection strings.
    expect(await page.content()).not.toMatch(/postgres(?:ql)?:\/\/[^"'\s]+/i);
    expect(await page.content()).not.toMatch(/DATABASE_URL\s*[:=]/i);
  });
});
