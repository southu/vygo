import { test, expect } from "@playwright/test";
import { methodContent } from "../src/content/method";
import { pricingContent } from "../src/content/pricing";
import { faqItems } from "../src/content/faq";
import { getRole } from "../src/content/careers";
import { mockAvailability } from "./helpers";

/**
 * Locks the four shipped QA & UAT copy blocks in production-rendered DOM:
 *   (a) Team/About QA & UAT Lead card   (/careers)
 *   (b) How-We-Work QA step             (/method)
 *   (c) engagement-tier deliverables    (/pricing — every tier)
 *   (d) QA/UAT FAQ entry                (/ — expanded accordion)
 *
 * Also guards the two verbatim phrases and the "never presented as optional /
 * offshore" invariants so a copy regression fails before deploy.
 */

// Source-of-truth strings pulled from the content modules.
const QA_STEP = methodContent.steps.find((s) => /Quality assurance & UAT/i.test(s.title))!;
const GATE_PHRASE = "not just developer-tested code";
const FAQ_ITEM = faqItems.find((i) => i.question === "Who tests the software before launch?")!;
const FAQ_PHRASE = "separate from the engineers writing the code";
const QA_ROLE = getRole("qa-uat-lead")!;
const TIER_BULLETS = [
  "Structured UAT program — your team validates every feature before cutover",
  "Independent QA sign-off on every release",
];
const FORBIDDEN_LOCATION = [/us-based/i, /offshore/i, /onshore/i, /nearshore/i];
const OPTIONAL_FRAMING = [
  /\boptional\b/i,
  /\badd-?on\b/i,
  /extra cost/i,
  /additional (?:cost|fee)/i,
  /available only/i,
  /only available/i,
  /surcharge/i,
];

test.describe("QA & UAT copy — production content lock", () => {
  test.beforeEach(async ({ page }) => {
    await mockAvailability(page, "open");
  });

  test("(a) Careers page shows the QA & UAT Lead card with approved summary", async ({ page }) => {
    await page.goto("/careers");
    const card = page
      .locator("article, li, div")
      .filter({ has: page.getByRole("heading", { name: QA_ROLE.title, exact: true }) })
      .last();
    await expect(card).toBeVisible();
    await expect(card).toContainText("never billed separately");
    await expect(card).toContainText("holds release sign-off");

    const cardText = (await card.innerText()).toLowerCase();
    for (const re of FORBIDDEN_LOCATION) {
      expect(cardText, `card must not mention ${re}`).not.toMatch(re);
    }
    for (const re of OPTIONAL_FRAMING) {
      expect(cardText, `card must not frame QA/UAT as ${re}`).not.toMatch(re);
    }
  });

  test("(b) Method page renders the QA step with the independent sign-off gate", async ({
    page,
  }) => {
    await page.goto("/method");
    const article = page.locator("article.card", { hasText: QA_STEP.title });
    await expect(article).toBeVisible();
    await expect(article).toContainText(QA_STEP.gate);
    await expect(article).toContainText(GATE_PHRASE);
    for (const activity of QA_STEP.activities) {
      await expect(article).toContainText(activity);
    }

    const text = (await article.innerText()).toLowerCase();
    for (const re of FORBIDDEN_LOCATION) {
      expect(text, `QA step must not mention ${re}`).not.toMatch(re);
    }
  });

  test("(c) Pricing page shows both QA/UAT bullets exactly once in every tier", async ({
    page,
  }) => {
    await page.goto("/pricing");
    for (const tier of pricingContent.tiers) {
      const card = page.locator(`#${tier.id}`);
      await expect(card, `tier card #${tier.id} present`).toBeVisible();
      for (const bullet of TIER_BULLETS) {
        await expect(
          card.getByText(bullet, { exact: false }),
          `${tier.id} must contain "${bullet}" exactly once`,
        ).toHaveCount(1);
      }
      const text = (await card.innerText()).toLowerCase();
      for (const re of FORBIDDEN_LOCATION) {
        expect(text, `${tier.id} must not mention ${re}`).not.toMatch(re);
      }
    }
  });

  test("(d) Homepage FAQ expands to the QA/UAT answer with the verbatim phrase", async ({
    page,
  }) => {
    await page.goto("/");
    const btn = page.getByRole("button", { name: FAQ_ITEM.question });
    await btn.scrollIntoViewIfNeeded();
    if ((await btn.getAttribute("aria-expanded")) !== "true") await btn.click();
    await expect(btn).toHaveAttribute("aria-expanded", "true");

    const panelId = await btn.getAttribute("aria-controls");
    const panel = page.locator(`#${panelId}`);
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(FAQ_PHRASE);
    await expect(panel).toContainText(FAQ_ITEM.answer);

    const text = (await panel.innerText()).toLowerCase();
    for (const re of FORBIDDEN_LOCATION) {
      expect(text, `FAQ answer must not mention ${re}`).not.toMatch(re);
    }
  });

  test("verbatim QA/UAT phrases survive in production content", async ({ page }) => {
    await page.goto("/method");
    await expect(page.locator("body")).toContainText(GATE_PHRASE);

    await page.goto("/");
    const btn = page.getByRole("button", { name: FAQ_ITEM.question });
    if ((await btn.getAttribute("aria-expanded")) !== "true") await btn.click();
    await expect(page.locator("body")).toContainText(FAQ_PHRASE);
  });
});
