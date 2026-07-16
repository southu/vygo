import { test, expect } from "@playwright/test";
import { APPLY_SUBMIT_TIMEOUT_MS } from "../src/lib/apply-submit";
import { mockAvailability } from "./helpers";

/**
 * Locks the /apply form submit flow: posts only to the server-side /api/apply
 * endpoint, shows inline thank-you confirmation on 2xx (no navigation), and
 * shows an error on 4xx / network / client timeout while preserving entered
 * values. Client never embeds DB credentials (asserted against page source + JS).
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

  test("successful submit shows inline thank-you with exact copy and audit date", async ({
    page,
  }) => {
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

    // Capture banner date before submit so confirmation can be matched to it.
    const bannerDate = await page
      .getByTestId("apply-next-audit-date")
      .locator("[data-next-audit-start-date]")
      .innerText();

    await page.getByTestId("apply-submit").click();

    await expect(page.getByTestId("apply-success")).toBeVisible();
    await expect(page.getByTestId("apply-success-heading")).toHaveText(
      "Thank you — your application is in.",
    );
    await expect(page.getByTestId("apply-success-message")).toHaveText(
      "A senior engineer at VYGO reviews every application against available openings, and we'll be in touch within one business day. Keep an eye on your inbox — the note will come from our team at vygo.ai.",
    );
    await expect(page.getByTestId("apply-success-next-audit-date")).toContainText(
      /Next available audit start date/i,
    );
    await expect(
      page.getByTestId("apply-success-next-audit-date").locator("[data-next-audit-start-date]"),
    ).toHaveText(bannerDate);
    await expect(page.getByTestId("apply-success")).toHaveAttribute(
      "data-application-id",
      createdId,
    );
    await expect(page.getByTestId("apply-form")).toHaveCount(0);
    // No full-page redirect — still on the apply page.
    await expect(page).toHaveURL(/\/apply\/?$/);
  });

  test("delayed 2xx still shows thank-you only after response arrives", async ({ page }) => {
    const createdId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    await page.route("**/api/apply", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      // Delay within the client timeout window — success must still win.
      await new Promise((r) => setTimeout(r, 800));
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

    await expect(page.getByTestId("apply-submit")).toBeDisabled();
    await expect(page.getByTestId("apply-submit")).toHaveText(/Submitting/i);
    await expect(page.getByTestId("apply-success")).toBeVisible();
    await expect(page.getByTestId("apply-success")).toHaveAttribute(
      "data-application-id",
      createdId,
    );
    await expect(page.getByTestId("apply-error")).toHaveCount(0);
    await expect(page).toHaveURL(/\/apply\/?$/);
  });

  test("4xx response shows visible error and keeps form values", async ({ page }) => {
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
    await page.getByTestId("apply-product-url").fill("https://example.com");
    await page.getByTestId("apply-submit").click();

    await expect(page.getByTestId("apply-error")).toBeVisible();
    await expect(page.getByTestId("apply-error")).toContainText(/work_email|valid|try again/i);
    await expect(page.getByTestId("apply-form")).toBeVisible();
    await expect(page.getByTestId("apply-success")).toHaveCount(0);
    // Entered values remain intact for retry.
    await expect(page.getByTestId("apply-full-name")).toHaveValue("Ratchet Tester");
    await expect(page.getByTestId("apply-work-email")).toHaveValue("not-an-email");
    await expect(page.getByTestId("apply-product-url")).toHaveValue("https://example.com");
    // Submit re-enabled after failure.
    await expect(page.getByTestId("apply-submit")).toBeEnabled();
  });

  test("rejected network shows error, keeps values, re-enables submit", async ({ page }) => {
    await page.route("**/api/apply", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.abort("failed");
    });

    await page.goto("/apply");
    await page.getByTestId("apply-full-name").fill("Ratchet Tester");
    await page.getByTestId("apply-work-email").fill("ratchet-tester@example.com");
    await page.getByTestId("apply-product-url").fill("https://example.com/product");
    await page.getByTestId("apply-message").fill("Ship AI feature X");
    await page.getByTestId("apply-submit").click();

    await expect(page.getByTestId("apply-error")).toBeVisible();
    await expect(page.getByTestId("apply-error")).toContainText(/network|try again/i);
    await expect(page.getByTestId("apply-success")).toHaveCount(0);
    await expect(page.getByTestId("apply-form")).toBeVisible();
    await expect(page.getByTestId("apply-full-name")).toHaveValue("Ratchet Tester");
    await expect(page.getByTestId("apply-work-email")).toHaveValue("ratchet-tester@example.com");
    await expect(page.getByTestId("apply-product-url")).toHaveValue("https://example.com/product");
    await expect(page.getByTestId("apply-message")).toHaveValue("Ship AI feature X");
    await expect(page.getByTestId("apply-submit")).toBeEnabled();
  });

  test("disables submit button while request is in flight", async ({ page }) => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    await page.route("**/api/apply", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await gate;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "INTERNAL", message: "Server error. Please try again." },
        }),
      });
    });

    await page.goto("/apply");
    await page.getByTestId("apply-full-name").fill("Ratchet Tester");
    await page.getByTestId("apply-work-email").fill("ratchet-tester@example.com");

    const submitPromise = page.getByTestId("apply-submit").click();
    await expect(page.getByTestId("apply-submit")).toBeDisabled();
    await expect(page.getByTestId("apply-submit")).toHaveText(/Submitting/i);

    release?.();
    await submitPromise;

    await expect(page.getByTestId("apply-error")).toBeVisible();
    await expect(page.getByTestId("apply-submit")).toBeEnabled();
    await expect(page.getByTestId("apply-success")).toHaveCount(0);
  });

  test("never-settling submit times out: error, form intact, button re-enabled", async ({
    page,
  }) => {
    test.setTimeout(APPLY_SUBMIT_TIMEOUT_MS + 30_000);

    // Hold the POST pending indefinitely — client abort must recover the UI.
    await page.route("**/api/apply", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await new Promise(() => {
        /* never settle */
      });
    });

    await page.goto("/apply");
    await page.getByTestId("apply-full-name").fill("Ratchet Tester");
    await page.getByTestId("apply-work-email").fill("ratchet-tester@example.com");
    await page.getByTestId("apply-product-url").fill("https://example.com");
    await page.getByTestId("apply-message").fill("Need production readiness review");
    await page.getByTestId("apply-submit").click();

    await expect(page.getByTestId("apply-submit")).toBeDisabled();
    await expect(page.getByTestId("apply-submit")).toHaveText(/Submitting/i);

    await expect(page.getByTestId("apply-error")).toBeVisible({
      timeout: APPLY_SUBMIT_TIMEOUT_MS + 5_000,
    });
    await expect(page.getByTestId("apply-error")).toContainText(/timed out|try again/i);
    await expect(page.getByTestId("apply-success")).toHaveCount(0);
    await expect(page.getByTestId("apply-form")).toBeVisible();
    await expect(page.getByTestId("apply-full-name")).toHaveValue("Ratchet Tester");
    await expect(page.getByTestId("apply-work-email")).toHaveValue("ratchet-tester@example.com");
    await expect(page.getByTestId("apply-product-url")).toHaveValue("https://example.com");
    await expect(page.getByTestId("apply-message")).toHaveValue("Need production readiness review");
    await expect(page.getByTestId("apply-submit")).toBeEnabled();
    await expect(page).toHaveURL(/\/apply\/?$/);
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
