import { test, expect, type Page } from "@playwright/test";
import {
  fillStep1,
  fillStep2,
  installDelayedTurnstileStub,
  installStuckTurnstileStub,
  installTurnstileStub,
  mockAvailability,
  piiLeakInAnalytics,
} from "./helpers";

test.describe("WaitlistForm", () => {
  test.beforeEach(async ({ page }) => {
    await mockAvailability(page, "waitlist");
    await installTurnstileStub(page);
  });

  test("keyboard-only open, complete, submit, dismiss modal", async ({ page }) => {
    await page.goto("/");
    const invoker = page.getByTestId("availability-bar-cta");
    await invoker.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("waitlist-modal")).toBeVisible();
    await expect(page.getByTestId("waitlist-form-heading")).toBeFocused();

    // Fill via keyboard-friendly locators
    await fillStep1(page, { email: `kb-${Date.now()}@example.com` });
    await page.getByTestId("waitlist-continue").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-waitlist-step="2"]')).toBeVisible();

    await fillStep2(page);

    // Intercept success
    await page.route("**/v1/waitlist", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { accepted: true, message: "Your application has been received." },
        }),
      });
    });

    await page.getByTestId("waitlist-submit").click();
    await expect(page.getByTestId("waitlist-success-card")).toBeVisible();
    await expect(page.getByTestId("success-next-action")).toBeVisible();

    await page.getByRole("button", { name: "Close" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("waitlist-modal")).toHaveCount(0);
    await expect(invoker).toBeFocused();
  });

  test("empty step shows field errors, summary links, live region", async ({ page }) => {
    await page.goto("/waitlist");
    await page.getByTestId("waitlist-continue").click();
    await expect(page.getByTestId("waitlist-error-summary")).toBeVisible();
    await expect(page.locator('[data-field-error="fullName"]')).toBeVisible();
    await expect(page.locator("#fullName")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByTestId("waitlist-live-assertive")).not.toBeEmpty();

    await page.locator('[data-error-summary-link="email"]').click();
    await expect(page.locator("#email")).toBeFocused();
  });

  test("server validation maps field errors and preserves values", async ({ page }) => {
    await page.goto("/waitlist");
    await fillStep1(page, {
      fullName: "Grace Hopper",
      email: "grace@example.com",
      companyName: "USN",
      productUrl: "https://example.com/cobol",
    });
    await page.getByTestId("waitlist-continue").click();
    await fillStep2(page);

    await page.route("**/v1/waitlist", async (route) => {
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
            message: "Please review the highlighted fields.",
            fields: { email: "Enter a valid work email.", companyName: "Enter your company name." },
          },
        }),
      });
    });

    await page.getByTestId("waitlist-submit").click();
    await expect(page.getByTestId("waitlist-error-summary")).toBeVisible();
    await expect(page.locator('[data-error-summary-link="email"]')).toBeVisible();
    // Values preserved (still on step 2; go back to check step 1)
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.locator("#fullName")).toHaveValue("Grace Hopper");
    await expect(page.locator("#email")).toHaveValue("grace@example.com");
    await expect(page.locator("#companyName")).toHaveValue("USN");
  });

  test("double-submit prevention and idempotency keys", async ({ page }) => {
    await page.goto("/waitlist");
    await fillStep1(page, { email: `idem-${Date.now()}@example.com` });
    await page.getByTestId("waitlist-continue").click();
    await fillStep2(page);

    const keys: string[] = [];
    let resolveFirst!: () => void;
    const firstGate = new Promise<void>((r) => {
      resolveFirst = r;
    });
    let posts = 0;

    await page.route("**/v1/waitlist", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      posts += 1;
      const headers = route.request().headers();
      const body = route.request().postDataJSON() as { idempotencyKey?: string };
      const key = headers["idempotency-key"] || body.idempotencyKey || "";
      keys.push(String(key));
      if (posts === 1) {
        await firstGate;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { accepted: true, message: "Your application has been received." },
        }),
      });
    });

    const submit = page.getByTestId("waitlist-submit");
    await submit.click();
    await expect(submit).toBeDisabled();
    // Second activation while pending
    await submit.click({ force: true }).catch(() => undefined);
    resolveFirst();
    await expect(page.getByTestId("waitlist-success-card")).toBeVisible();
    expect(posts).toBe(1);
    expect(keys[0]).toBeTruthy();

    // Distinct later submission after success requires remount — use validation failure retry path
    await page.reload();
    await installTurnstileStub(page);
    await fillStep1(page, { email: `idem2-${Date.now()}@example.com` });
    await page.getByTestId("waitlist-continue").click();
    await fillStep2(page);

    const keys2: string[] = [];
    await page.unroute("**/v1/waitlist");
    let attempt = 0;
    await page.route("**/v1/waitlist", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      attempt += 1;
      const headers = route.request().headers();
      const body = route.request().postDataJSON() as { idempotencyKey?: string };
      keys2.push(String(headers["idempotency-key"] || body.idempotencyKey || ""));
      if (attempt === 1) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Transient failure" } }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { accepted: true, message: "Your application has been received." },
        }),
      });
    });

    await page.getByTestId("waitlist-submit").click();
    await expect(page.getByTestId("waitlist-status")).toContainText(/Transient|wrong|error/i);
    await page.getByTestId("waitlist-submit").click();
    await expect(page.getByTestId("waitlist-success-card")).toBeVisible();
    expect(keys2[0]).toBeTruthy();
    expect(keys2[1]).toBe(keys2[0]); // retry reuses key
    expect(keys2[0]).not.toBe(keys[0]); // distinct from earlier logical attempt
  });

  test("success and duplicate render success card in place", async ({ page }) => {
    await page.goto("/waitlist");
    await fillStep1(page, { email: `dup-${Date.now()}@example.com` });
    await page.getByTestId("waitlist-continue").click();
    await fillStep2(page);

    await page.route("**/v1/waitlist", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            accepted: true,
            message: "You are already registered on the waitlist.",
          },
        }),
      });
    });

    await page.getByTestId("waitlist-submit").click();
    const card = page.getByTestId("waitlist-success-card");
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-waitlist-outcome", "duplicate");
    await expect(page.getByTestId("success-next-action")).toBeVisible();
    // Does not auto-navigate away
    await expect(page).toHaveURL(/\/waitlist/);
    await expect(page.getByTestId("waitlist-live-polite")).not.toBeEmpty();
  });

  test("Turnstile token included; unavailable shows fallback and preserves values", async ({
    page,
  }) => {
    await page.goto("/waitlist");
    await fillStep1(page, { email: `ts-${Date.now()}@example.com`, fullName: "Turnstile User" });
    await page.getByTestId("waitlist-continue").click();
    await fillStep2(page);

    let sawToken = false;
    await page.route("**/v1/waitlist", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      const body = route.request().postDataJSON() as { turnstileToken?: string };
      sawToken = body.turnstileToken === "test-turnstile-token";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { accepted: true, message: "Your application has been received." },
        }),
      });
    });

    await page.getByTestId("waitlist-submit").click();
    await expect(page.getByTestId("waitlist-success-card")).toBeVisible();
    expect(sawToken).toBe(true);

    // Unavailable path
    await page.goto("/waitlist");
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).turnstile = undefined;
      Object.defineProperty(window, "turnstile", {
        get: () => undefined,
        configurable: true,
      });
    });
    // Block turnstile script
    await page.route("**/challenges.cloudflare.com/**", (route) => route.abort());
    await page.reload();
    await fillStep1(page, { fullName: "Preserved Name", email: `fb-${Date.now()}@example.com` });
    await page.getByTestId("waitlist-continue").click();
    // Wait for fallback
    await expect(page.getByTestId("turnstile-fallback")).toBeVisible({ timeout: 12_000 });
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.locator("#fullName")).toHaveValue("Preserved Name");
  });

  test("attribution fields only; analytics has no PII", async ({ page }) => {
    await page.goto("/waitlist?utm_source=testsrc&utm_medium=cpc&utm_campaign=spring");
    await fillStep1(page, {
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      companyName: "Analytical Engines",
    });
    await page.getByTestId("waitlist-continue").click();
    await fillStep2(page);

    let body: Record<string, unknown> | null = null;
    await page.route("**/v1/waitlist", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      body = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { accepted: true, message: "Your application has been received." },
        }),
      });
    });

    await page.getByTestId("waitlist-submit").click();
    await expect(page.getByTestId("waitlist-success-card")).toBeVisible();

    expect(body).toBeTruthy();
    const utm = body!.utm as Record<string, string | null>;
    expect(utm.source).toBe("testsrc");
    expect(utm.medium).toBe("cpc");
    expect(utm.campaign).toBe("spring");
    expect(body!.landingPage).toBe("/waitlist");
    // No unapproved keys
    expect(body!.userAgent).toBeUndefined();
    expect(body!.ip).toBeUndefined();
    expect(body!.cookies).toBeUndefined();
    expect(body!.fingerprint).toBeUndefined();

    const events = await page.evaluate(() => window.__vygoAnalytics ?? []);
    const leaks = piiLeakInAnalytics(events);
    expect(leaks, leaks.join("\n")).toEqual([]);
  });

  test("inputs have accessible names and autocomplete", async ({ page }) => {
    await page.goto("/waitlist");
    await expect(page.locator("#fullName")).toHaveAttribute("autocomplete", "name");
    await expect(page.locator('label[for="fullName"]')).toBeVisible();
    await expect(page.locator("#email")).toHaveAttribute("autocomplete", "email");
    await expect(page.locator("#companyName")).toHaveAttribute("autocomplete", "organization");
    await expect(page.locator("#productUrl")).toHaveAttribute("autocomplete", "url");
    await expect(page.locator("#role")).toHaveAttribute("autocomplete", "organization-title");
  });

  test("Continue with valid step 1 does not auto-submit or show step 2 errors (mouse)", async ({
    page,
  }) => {
    await page.goto("/waitlist");
    await fillStep1(page, { email: `cont-mouse-${Date.now()}@example.com` });
    await page.getByTestId("waitlist-continue").click();

    await expect(page.locator('[data-waitlist-step="2"]')).toBeVisible();
    await expect(page.getByTestId("waitlist-error-summary")).toHaveCount(0);
    await expect(page.getByTestId("waitlist-form-heading")).toBeFocused();

    const assertive = page.getByTestId("waitlist-live-assertive");
    const assertiveText = ((await assertive.textContent()) || "").trim();
    expect(assertiveText).not.toMatch(/error/i);

    const events = await page.evaluate(() => window.__vygoAnalytics ?? []);
    const validationFailures = events.filter((e) => e.event === "waitlist_validation_failure");
    expect(validationFailures).toEqual([]);
  });

  test("Continue with valid step 1 does not auto-submit or show step 2 errors (keyboard)", async ({
    page,
  }) => {
    await page.goto("/waitlist");
    await fillStep1(page, { email: `cont-kb-${Date.now()}@example.com` });
    await page.getByTestId("waitlist-continue").focus();
    await page.keyboard.press("Enter");

    await expect(page.locator('[data-waitlist-step="2"]')).toBeVisible();
    await expect(page.getByTestId("waitlist-error-summary")).toHaveCount(0);
    await expect(page.getByTestId("waitlist-form-heading")).toBeFocused();

    const assertive = page.getByTestId("waitlist-live-assertive");
    const assertiveText = ((await assertive.textContent()) || "").trim();
    expect(assertiveText).not.toMatch(/error/i);

    const events = await page.evaluate(() => window.__vygoAnalytics ?? []);
    const validationFailures = events.filter((e) => e.event === "waitlist_validation_failure");
    expect(validationFailures).toEqual([]);
  });

  test("modal focus trap keeps Shift+Tab within dialog after open", async ({ page }) => {
    await page.goto("/");
    const invoker = page.getByTestId("availability-bar-cta");
    await invoker.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("waitlist-modal")).toBeVisible();
    await expect(page.getByTestId("waitlist-form-heading")).toBeFocused();

    await page.keyboard.press("Shift+Tab");

    const stillInside = await page.evaluate(() => {
      const modal = document.querySelector("[data-testid=waitlist-modal]");
      const active = document.activeElement;
      return Boolean(modal && active && modal.contains(active));
    });
    expect(stillInside).toBe(true);

    // Extra Tab cycles must also stay inside the modal.
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press(i % 2 === 0 ? "Tab" : "Shift+Tab");
      const inside = await page.evaluate(() => {
        const modal = document.querySelector("[data-testid=waitlist-modal]");
        const active = document.activeElement;
        return Boolean(modal && active && modal.contains(active));
      });
      expect(inside).toBe(true);
    }
  });

  test("Tab from focused error summary reaches the first summary link", async ({ page }) => {
    await page.goto("/");
    const invoker = page.getByTestId("availability-bar-cta");
    await invoker.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("waitlist-modal")).toBeVisible();

    // Empty step 1 → error summary receives programmatic focus (tabindex=-1).
    await page.getByTestId("waitlist-continue").click();
    const summary = page.getByTestId("waitlist-error-summary");
    await expect(summary).toBeVisible();
    // Focus is applied in an effect / rAF — settle on document.activeElement.
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const el = document.activeElement;
          return el?.getAttribute("data-testid") ?? el?.tagName ?? null;
        }),
      )
      .toBe("waitlist-error-summary");

    await page.keyboard.press("Tab");

    const activeIsFirstLink = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      if (!active || active.tagName !== "A") return false;
      if (!active.hasAttribute("data-error-summary-link")) return false;
      const links = document.querySelectorAll("a[data-error-summary-link]");
      return links[0] === active;
    });
    expect(activeIsFirstLink).toBe(true);

    // Enter on the first summary link moves focus to the corresponding field.
    await page.keyboard.press("Enter");
    await expect(page.locator("#fullName")).toBeFocused();
  });

  test("focus is inside the modal after the success card renders", async ({ page }) => {
    await page.goto("/");
    const invoker = page.getByTestId("availability-bar-cta");
    await invoker.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("waitlist-modal")).toBeVisible();

    // Server enforces a formStartedAt anti-bot dwell window; wait before submit.
    await page.waitForTimeout(3100);

    await fillStep1(page, { email: `focus-success-${Date.now()}@example.com` });
    await page.getByTestId("waitlist-continue").click();
    await expect(page.locator('[data-waitlist-step="2"]')).toBeVisible();
    await fillStep2(page);

    await page.route("**/v1/waitlist", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { accepted: true, message: "Your application has been received." },
        }),
      });
    });

    await page.getByTestId("waitlist-submit").click();
    await expect(page.getByTestId("waitlist-success-card")).toBeVisible();

    // Focus must land on the success heading (or another element inside the modal),
    // never document.body after the submit control unmounts.
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const modal = document.querySelector("[data-testid=waitlist-modal]");
          const active = document.activeElement;
          if (!modal || !active || active === document.body) return "body-or-outside";
          if (!modal.contains(active)) return "outside-modal";
          if (
            active.id === "waitlist-form-heading" ||
            active.closest("[data-testid=waitlist-success-card]")
          ) {
            return "inside-success";
          }
          return modal.contains(active) ? "inside-modal" : "outside-modal";
        }),
      )
      .toMatch(/inside/);

    // Escape still dismisses and returns focus to the invoking CTA.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("waitlist-modal")).toHaveCount(0);
    await expect(invoker).toBeFocused();
  });
});

test.describe("WaitlistForm cold first-attempt (async Turnstile token)", () => {
  test.beforeEach(async ({ page }) => {
    await mockAvailability(page, "waitlist");
    // Token arrives ~1.2s after render — reproduces the real cold race the
    // synchronous stub hides.
    await installDelayedTurnstileStub(page, { delayMs: 1200 });
  });

  test("first click before token lands is queued and auto-submits on arrival", async ({ page }) => {
    await page.goto("/waitlist");
    await fillStep1(page, { email: `cold-${Date.now()}@example.com` });
    await page.getByTestId("waitlist-continue").click();
    await expect(page.locator('[data-waitlist-step="2"]')).toBeVisible();

    await page.locator("#stage").selectOption("live_users");
    await page.locator("#primaryBlocker").selectOption("security");
    await page.locator("#desiredStartWindow").selectOption("within_30_days");
    await page
      .locator("#message")
      .fill("We need production hardening before an enterprise rollout next month.");
    await page.locator("#privacyAccepted").check();

    let posts = 0;
    let sawToken = false;
    await page.route("**/v1/waitlist", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      posts += 1;
      const body = route.request().postDataJSON() as { turnstileToken?: string };
      sawToken = body.turnstileToken === "test-turnstile-token";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { accepted: true, message: "Your application has been received." },
        }),
      });
    });

    const submit = page.getByTestId("waitlist-submit");
    // Click immediately — the token has not been issued yet (widget delay 1.2s).
    await submit.click();
    // No client "complete the challenge" error; the submit is queued.
    await expect(page.locator('[data-field-error="turnstileToken"]')).toHaveCount(0);
    await expect(submit).toBeDisabled();

    // A single click succeeds once the delayed token lands — no second retry.
    await expect(page.getByTestId("waitlist-success-card")).toBeVisible({ timeout: 5_000 });
    expect(posts).toBe(1);
    expect(sawToken).toBe(true);
  });
});

// The production cold hang: window.turnstile is defined and a widget renders,
// but its callback never fires, so the token stays empty forever. Before the
// bounded-timeout fix a queued submit sat on "Verifying you're human…"
// indefinitely (no success, no fallback, no POST). Each test below runs in its
// own fresh Playwright browser context with no prior verify-human warm-up, so
// together they prove two independent cold first attempts both reach a terminal
// state — not a warm-run-dependent pass.
test.describe("WaitlistForm cold first-attempt (Turnstile callback never fires)", () => {
  test.beforeEach(async ({ page }) => {
    await mockAvailability(page, "waitlist");
    // Widget mounts but never issues a token — the exact production hang.
    await installStuckTurnstileStub(page);
  });

  async function reachStuckSubmit(page: Page, posts: { count: number }) {
    await page.goto("/waitlist");
    await fillStep1(page, { email: `stuck-${Date.now()}@example.com` });
    await page.getByTestId("waitlist-continue").click();
    await expect(page.locator('[data-waitlist-step="2"]')).toBeVisible();

    await page.locator("#stage").selectOption("live_users");
    await page.locator("#primaryBlocker").selectOption("security");
    await page.locator("#desiredStartWindow").selectOption("within_30_days");
    await page
      .locator("#message")
      .fill("We need production hardening before an enterprise rollout next month.");
    await page.locator("#privacyAccepted").check();

    // A submit with an empty token must never be soft-accepted as success.
    await page.route("**/v1/waitlist", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      posts.count += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { accepted: true, message: "Your application has been received." },
        }),
      });
    });

    const submit = page.getByTestId("waitlist-submit");
    await submit.click();
    // The click is queued (not rejected): shows the pending affordance, no POST yet.
    await expect(submit).toBeDisabled();
    await expect(submit).toContainText(/Verifying you.?re human/i);
    return submit;
  }

  test("first cold attempt: never-firing token times out into fallback, not an infinite spinner", async ({
    page,
  }) => {
    const posts = { count: 0 };
    const submit = await reachStuckSubmit(page, posts);

    // Bounded timeout must exit the pending state into the actionable fallback —
    // NOT sit on "Verifying you're human…" forever and NOT fake a success.
    await expect(page.getByTestId("turnstile-fallback")).toBeVisible({ timeout: 14_000 });
    await expect(page.locator('[data-field-error="turnstileToken"]')).toBeVisible();
    await expect(submit).not.toBeDisabled();
    await expect(submit).not.toContainText(/Verifying you.?re human/i);
    await expect(page.getByTestId("waitlist-success-card")).toHaveCount(0);
    // No empty-token POST was ever soft-accepted as success.
    expect(posts.count).toBe(0);
  });

  test("second independent cold context reaches the same terminal fallback", async ({ page }) => {
    const posts = { count: 0 };
    const submit = await reachStuckSubmit(page, posts);

    await expect(page.getByTestId("turnstile-fallback")).toBeVisible({ timeout: 14_000 });
    await expect(submit).not.toBeDisabled();
    await expect(page.getByTestId("waitlist-success-card")).toHaveCount(0);
    expect(posts.count).toBe(0);
  });
});
