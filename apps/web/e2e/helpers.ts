import type { Page, Route } from "@playwright/test";

export const LIVE = process.env.PLAYWRIGHT_BASE_URL || process.env.LIVE_URL || "http://127.0.0.1:8380";

export type AvailabilityStatus = "open" | "waitlist" | "paused";

export function availabilityPayload(status: AvailabilityStatus, overrides: Record<string, unknown> = {}) {
  return {
    data: {
      status,
      nextOpeningDate: "2026-09-15",
      engagementType: "audit",
      displayNote: "Senior-only pods. Limited concurrent engagements.",
      availableStarts: status === "open" ? 2 : null,
      updatedAt: new Date().toISOString(),
      ...overrides,
    },
  };
}

export async function mockAvailability(
  page: Page,
  status: AvailabilityStatus | "error" | "delay",
  options?: { delayMs?: number },
) {
  await page.route("**/v1/public/availability**", async (route: Route) => {
    if (status === "error") {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "fail" }) });
      return;
    }
    if (status === "delay") {
      await new Promise((r) => setTimeout(r, options?.delayMs ?? 5_000));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(availabilityPayload("waitlist")),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(availabilityPayload(status)),
    });
  });
}

/** Install a minimal Turnstile stub that immediately issues a test token. */
export async function installTurnstileStub(page: Page, token = "test-turnstile-token") {
  await page.addInitScript((tok) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    w.turnstile = {
      render: (_el: HTMLElement, opts: { callback: (t: string) => void }) => {
        setTimeout(() => opts.callback(tok), 50);
        return "widget-test";
      },
      reset: () => undefined,
      remove: () => undefined,
    };
  }, token);
}

export async function fillStep1(
  page: Page,
  values: {
    fullName?: string;
    email?: string;
    companyName?: string;
    productUrl?: string;
    role?: string;
  } = {},
) {
  await page.locator("#fullName").fill(values.fullName ?? "Ada Lovelace");
  await page.locator("#email").fill(values.email ?? `ada+${Date.now()}@example.com`);
  await page.locator("#companyName").fill(values.companyName ?? "Analytical Engines");
  await page.locator("#productUrl").fill(values.productUrl ?? "https://example.com/product");
  if (values.role) await page.locator("#role").fill(values.role);
}

export async function fillStep2(page: Page) {
  await page.locator("#stage").selectOption("live_users");
  await page.locator("#primaryBlocker").selectOption("security");
  await page.locator("#desiredStartWindow").selectOption("within_30_days");
  await page.locator("#message").fill("We need production hardening before an enterprise rollout next month.");
  await page.locator("#privacyAccepted").check();
}

export function piiLeakInAnalytics(events: unknown[]): string[] {
  const leaks: string[] = [];
  const piiPatterns = [
    /@example\.com/i,
    /Ada Lovelace/i,
    /Analytical Engines/i,
    /test-turnstile-token/i,
    /production hardening/i,
  ];
  for (const ev of events) {
    const raw = JSON.stringify(ev);
    for (const re of piiPatterns) {
      if (re.test(raw)) leaks.push(`${re}: ${raw.slice(0, 200)}`);
    }
  }
  return leaks;
}
