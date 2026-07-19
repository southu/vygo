import { test, expect, type Route } from "@playwright/test";
import { installDelayedTurnstileStub, installTurnstileStub } from "./helpers";

/**
 * Cold first-attempt regression coverage for the readiness score gate
 * (ScoreGateForm) — the second verify-human surface that shares the exact
 * render/callback race the waitlist form had. See
 * docs/verify-human-flake-rca.md: the Submit control was submittable before the
 * async Cloudflare Turnstile token existed, so a first (cold) click failed the
 * "complete the verification challenge" guard, surfaced the "Could not score
 * right now" gate error, and only a later (warm) click passed. These tests drive
 * the gate with a Turnstile stub whose token arrives asynchronously, proving the
 * first cold click is queued (a disabled "Verifying you're human…" affordance,
 * no gate error) and auto-submits once the token lands — with no prior warm-up
 * of the flow and no second user retry.
 *
 * If the queue fix regresses, the cold click again fails its guard: no auto
 * submit fires, the gate-error banner appears, and the run never reaches the
 * snapshot — every assertion below flips, so the silent first-run failure cannot
 * return unnoticed.
 */

/** A resume token long enough to satisfy ReadinessFlow's >=16 char guard. */
const GATE_TOKEN = "cold-gate-token-0000000000000000";

/**
 * Deep-link straight to the gate view by resuming a session whose server stage
 * is "gate", so the test exercises the verify-human step in isolation without
 * warming it via the full paste/confirm flow. All API calls are mocked — no
 * real backend, no real Cloudflare challenge.
 */
async function routeGateSession(route: Route) {
  if (route.request().method() !== "GET") {
    await route.continue();
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      token: GATE_TOKEN,
      stage: "gate",
      draft: {
        email: "cold-gate@example.com",
        // Pre-supplied so ReadinessFlow does not mint a fresh submission token.
        submissionToken: "sub-cold-gate-token",
      },
    }),
  });
}

/** Mint endpoint is best-effort — stub it so an unrouted call cannot hang load. */
async function routeMintToken(route: Route) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ token: "sub-cold-gate-token" }),
  });
}

/**
 * Fulfill POST /v1/readiness/score with a scored snapshot and record how many
 * times it was called and whether the async Turnstile token reached the server.
 */
function scoreRoute(snapshotId: string) {
  const state = { posts: 0, sawToken: false };
  const handler = async (route: Route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    state.posts += 1;
    const body = route.request().postDataJSON() as { turnstileToken?: string };
    state.sawToken = body.turnstileToken === "test-turnstile-token";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        snapshotId,
        snapshotPath: `/readiness/snapshot?id=${snapshotId}`,
        bucket: "Launch",
        overall: 62,
        scores: { security: 60 },
      }),
    });
  };
  return { state, handler };
}

test.describe("Readiness score gate cold first-attempt (async Turnstile token)", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/v1/readiness/session/**", routeGateSession);
    await page.route("**/api/readiness/token", routeMintToken);
  });

  test("first cold click is queued and auto-submits once the token lands", async ({ page }) => {
    // Token arrives ~3s after the widget renders — a wide window so the cold click
    // is deterministically before the token regardless of fill speed. This is the
    // exact async gap the synchronous stub (and prior e2e) hid.
    await installDelayedTurnstileStub(page, { delayMs: 3000 });
    const score = scoreRoute("snap-cold-gate-1");
    await page.route("**/v1/readiness/score", score.handler);

    await page.goto(`/readiness?token=${GATE_TOKEN}`);

    const gate = page.getByTestId("readiness-score-gate");
    await expect(gate).toBeVisible();
    // Must be the real widget path, not the ?e2e bypass (which skips the race).
    await expect(gate).toHaveAttribute("data-readiness-e2e", "0");

    await page.getByTestId("gate-name").fill("Cold Start Tester");
    await page.getByTestId("gate-email").fill("cold-gate@example.com");
    await page.getByTestId("gate-privacy").check();

    const submit = page.getByTestId("gate-submit");
    // Click immediately — the token has not been issued yet (widget delay 3s).
    await submit.click();

    // Cold click is queued, not rejected: no "Could not score right now" banner and
    // the widget did not fall back to the manual path.
    await expect(page.getByTestId("gate-error")).toHaveCount(0);
    await expect(page.getByTestId("turnstile-fallback")).toHaveCount(0);
    // Button reflects the queued verify-human state and cannot be re-clicked.
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveText(/Verifying you're human/i);

    // A single cold click succeeds once the delayed token lands — no second retry.
    await page.waitForURL(/\/readiness\/snapshot\?id=snap-cold-gate-1/, { timeout: 10_000 });
    expect(score.state.posts).toBe(1);
    expect(score.state.sawToken).toBe(true);
  });

  test("second independent cold context also succeeds (no warm-up dependence)", async ({
    browser,
  }) => {
    // A brand-new context: no prior navigation or interaction that could warm the
    // verify-human path — mirrors the tester's second fresh cold attempt.
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.route("**/v1/readiness/session/**", routeGateSession);
      await page.route("**/api/readiness/token", routeMintToken);
      await installDelayedTurnstileStub(page, { delayMs: 3000 });
      const score = scoreRoute("snap-cold-gate-2");
      await page.route("**/v1/readiness/score", score.handler);

      await page.goto(`/readiness?token=${GATE_TOKEN}`);
      await expect(page.getByTestId("readiness-score-gate")).toBeVisible();
      await page.getByTestId("gate-name").fill("Second Cold Tester");
      await page.getByTestId("gate-email").fill("cold-gate-2@example.com");
      await page.getByTestId("gate-privacy").check();

      const submit = page.getByTestId("gate-submit");
      await submit.click();
      await expect(page.getByTestId("gate-error")).toHaveCount(0);
      await expect(submit).toBeDisabled();
      await expect(submit).toHaveText(/Verifying you're human/i);

      await page.waitForURL(/\/readiness\/snapshot\?id=snap-cold-gate-2/, { timeout: 10_000 });
      expect(score.state.posts).toBe(1);
      expect(score.state.sawToken).toBe(true);
    } finally {
      await context.close();
    }
  });
});

test.describe("Readiness score gate warm path (synchronous token) still succeeds", () => {
  test("submit with an already-issued token scores immediately", async ({ page }) => {
    // Guardrail: the queue fix must not break the common case where the token is
    // already present at click time.
    await page.route("**/v1/readiness/session/**", routeGateSession);
    await page.route("**/api/readiness/token", routeMintToken);
    await installTurnstileStub(page);
    const score = scoreRoute("snap-warm-gate-1");
    await page.route("**/v1/readiness/score", score.handler);

    await page.goto(`/readiness?token=${GATE_TOKEN}`);
    await expect(page.getByTestId("readiness-score-gate")).toBeVisible();
    await page.getByTestId("gate-name").fill("Warm Tester");
    await page.getByTestId("gate-email").fill("warm-gate@example.com");
    await page.getByTestId("gate-privacy").check();
    // Let the synchronous stub callback populate the token before the click.
    await page.waitForTimeout(150);

    await page.getByTestId("gate-submit").click();
    await page.waitForURL(/\/readiness\/snapshot\?id=snap-warm-gate-1/, { timeout: 10_000 });
    expect(score.state.posts).toBe(1);
    expect(score.state.sawToken).toBe(true);
  });
});
