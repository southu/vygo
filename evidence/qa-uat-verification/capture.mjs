/**
 * QA & UAT verification-pass evidence capture.
 * Drives the LIVE deployed site (https://www.vygo.ai) with headless Chromium,
 * captures screenshots at mobile (~375px) and desktop (~1280px), records the
 * browser console, checks for horizontal overflow / collapsed sections, and
 * extracts rendered-DOM text for the four new QA & UAT copy blocks.
 *
 * Usage: node evidence/qa-uat-verification/capture.mjs
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
// Resolve @playwright/test from apps/web (three levels up: evidence/qa-uat-verification/..).
const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { chromium } = require(
  process.env.PW_PKG || path.join(repoRoot, "apps/web/node_modules/@playwright/test"),
);
import fs from "node:fs";

const BASE = process.env.LIVE_URL || "https://www.vygo.ai";
const DIR = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(DIR, "screenshots");
const CONSOLE = path.join(DIR, "console");
const DOM = path.join(DIR, "dom");
for (const d of [SHOTS, CONSOLE, DOM]) fs.mkdirSync(d, { recursive: true });

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "desktop", width: 1280, height: 900 },
];

// The four target locations. `locate` returns the Locator for the target
// section; `expand` (optional) performs interaction (e.g. open the FAQ item).
const TARGETS = [
  {
    key: "a-careers-qa-uat-card",
    url: "/careers",
    async locate(page) {
      // The role card containing the "QA & UAT Lead" heading.
      return page.locator("article, .card, li, div", { hasText: "QA & UAT Lead" }).filter({
        has: page.getByText("QA & UAT Lead", { exact: true }),
      }).last();
    },
  },
  {
    key: "b-method-qa-step",
    url: "/method",
    async locate(page) {
      return page.locator("article.card", {
        hasText: "Quality assurance & UAT, built into every build",
      });
    },
  },
  {
    key: "c-pricing-tier-deliverables",
    url: "/pricing",
    async locate(page) {
      return page.locator("#scale");
    },
  },
  {
    key: "d-faq-qa-uat",
    url: "/",
    async expand(page) {
      const btn = page.getByRole("button", { name: "Who tests the software before launch?" });
      await btn.scrollIntoViewIfNeeded();
      const expanded = await btn.getAttribute("aria-expanded");
      if (expanded !== "true") await btn.click();
      await page.waitForTimeout(300);
    },
    async locate(page) {
      // The FAQ card wrapping the target question + its expanded panel.
      return page
        .locator("div.card", { hasText: "Who tests the software before launch?" })
        .first();
    },
  },
];

const summary = [];

const browser = await chromium.launch();
try {
  for (const vp of VIEWPORTS) {
    for (const t of TARGETS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();
      const consoleErrors = [];
      const consoleAll = [];
      page.on("console", (msg) => {
        const line = `[${msg.type()}] ${msg.text()}`;
        consoleAll.push(line);
        if (msg.type() === "error") consoleErrors.push(line);
      });
      page.on("pageerror", (err) => {
        const line = `[pageerror] ${err.message}`;
        consoleAll.push(line);
        consoleErrors.push(line);
      });

      const url = BASE + t.url;
      await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
      if (t.expand) await t.expand(page);

      const locator = await t.locate(page);
      await locator.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);

      const box = await locator.first().boundingBox();
      const scrollWidth = await page.evaluate(
        () => document.documentElement.scrollWidth,
      );
      const overflow = scrollWidth - vp.width;

      const shotFile = path.join(SHOTS, `${t.key}.${vp.name}.png`);
      await locator.first().screenshot({ path: shotFile });

      const consoleFile = path.join(CONSOLE, `${t.key}.${vp.name}.console.txt`);
      fs.writeFileSync(
        consoleFile,
        `URL: ${url}\nViewport: ${vp.width}x${vp.height}\n` +
          `Console error count: ${consoleErrors.length}\n` +
          `document.documentElement.scrollWidth: ${scrollWidth} (viewport ${vp.width}, overflow ${overflow})\n` +
          `Target boundingBox height: ${box ? box.height.toFixed(1) : "null"}\n\n` +
          `--- ERROR-LEVEL ENTRIES ---\n${consoleErrors.join("\n") || "(none)"}\n\n` +
          `--- ALL CONSOLE ENTRIES ---\n${consoleAll.join("\n") || "(none)"}\n`,
      );

      summary.push({
        target: t.key,
        viewport: vp.name,
        width: vp.width,
        url,
        consoleErrors: consoleErrors.length,
        scrollWidth,
        overflowPx: overflow,
        sectionHeight: box ? Number(box.height.toFixed(1)) : null,
        screenshot: path.relative(DIR, shotFile),
      });

      await context.close();
    }
  }

  // Per-tier rendered-DOM bullet counts (desktop render).
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/pricing", { waitUntil: "networkidle", timeout: 60000 });
  const BULLETS = [
    "Structured UAT program — your team validates every feature before cutover",
    "Independent QA sign-off on every release",
  ];
  const tierReport = {};
  for (const id of ["launch", "scale", "enterprise"]) {
    const text = await page.locator(`#${id}`).innerText();
    tierReport[id] = {};
    for (const b of BULLETS) {
      const count = text.split(b).length - 1;
      tierReport[id][b] = count;
    }
  }
  fs.writeFileSync(
    path.join(DOM, "pricing-tier-bullet-counts.json"),
    JSON.stringify(tierReport, null, 2),
  );

  // Rendered-DOM full innerText of the four target sections (for grep evidence).
  const domDump = {};
  // careers
  await page.goto(BASE + "/careers", { waitUntil: "networkidle" });
  domDump["careers-qa-uat-card"] = await page
    .locator("article, .card, li, div")
    .filter({ has: page.getByText("QA & UAT Lead", { exact: true }) })
    .last()
    .innerText();
  // method
  await page.goto(BASE + "/method", { waitUntil: "networkidle" });
  domDump["method-qa-step"] = await page
    .locator("article.card", { hasText: "Quality assurance & UAT, built into every build" })
    .innerText();
  // pricing scale tier
  await page.goto(BASE + "/pricing", { waitUntil: "networkidle" });
  domDump["pricing-scale-tier"] = await page.locator("#scale").innerText();
  // faq expanded
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  const faqBtn = page.getByRole("button", { name: "Who tests the software before launch?" });
  await faqBtn.scrollIntoViewIfNeeded();
  if ((await faqBtn.getAttribute("aria-expanded")) !== "true") await faqBtn.click();
  await page.waitForTimeout(300);
  domDump["faq-qa-uat"] = await page
    .locator("div.card", { hasText: "Who tests the software before launch?" })
    .first()
    .innerText();
  fs.writeFileSync(path.join(DOM, "rendered-sections.json"), JSON.stringify(domDump, null, 2));

  await ctx.close();

  fs.writeFileSync(
    path.join(DIR, "capture-summary.json"),
    JSON.stringify({ base: BASE, tierReport, summary }, null, 2),
  );
  console.log(JSON.stringify({ tierReport, summary }, null, 2));
} finally {
  await browser.close();
}
