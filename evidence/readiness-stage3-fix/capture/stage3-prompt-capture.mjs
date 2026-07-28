// Stage 3 diagnostic-prompt capture for the readiness flow.
//
// Drives the /readiness flow (project → 5-step intake → Stage 2 prompt → Stage 3
// paste results) and captures evidence that the generated VYGO READINESS
// DIAGNOSTIC PROMPT is now displayed ON the Stage 3 ("paste results") screen,
// not only on Stage 2. Records every console message and network request so the
// run doubles as the console/network log capture (acceptance #4).
//
// Usage:
//   BASE_URL=http://127.0.0.1:8380 node stage3-prompt-capture.mjs        (local dev)
//   BASE_URL=https://www.vygo.ai   node stage3-prompt-capture.mjs        (live site)
//
// Local runs mock the backend endpoints with page.route() so the client state
// machine is driven deterministically without a real API. Against the live site
// (BASE_URL host !== 127.0.0.1/localhost) the real backend is used and no routes
// are mocked — set LIVE=1 to force that behaviour explicitly.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
// evidence/readiness-stage3-fix/capture -> repo root is three dirs up. Playwright
// is a pnpm workspace dep of apps/web (not hoisted to the repo root), so resolve
// it there — matching live-stage3-capture.mjs.
const repoRoot = resolve(__dirname, "..", "..", "..");
const { chromium } = require(
  process.env.PW_PKG || join(repoRoot, "apps/web/node_modules/@playwright/test"),
);
const outDir = resolve(__dirname, "..");
const shotsDir = resolve(outDir, "screenshots");
const consoleDir = resolve(outDir, "console");
const networkDir = resolve(outDir, "network");
for (const d of [shotsDir, consoleDir, networkDir]) mkdirSync(d, { recursive: true });

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:8380";
const isLocalHost = /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:|\/|$)/.test(BASE_URL);
const LIVE = process.env.LIVE === "1" || !isLocalHost;

const SESSION_TOKEN = "cap-session-token-0000000000000000";
const SUBMISSION_TOKEN = "cap-submission-token-1111111111";
const COMPLETE_STAGE1 = {
  productDescription: "A scheduling SaaS for clinics with paying customers.",
  whoUses: "External users paying",
  builtWith: "Cursor",
  blockers: ["security questionnaire or review blocking a deal"],
  deadline: "No hard deadline",
};

function json(body, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify(body) };
}

async function installMockRoutes(page) {
  const store = { token: SESSION_TOKEN, stage: "intake", draft: {} };
  await page.route("**/v1/readiness/session", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const body = route.request().postDataJSON() ?? {};
    store.stage = body.stage ?? "intake";
    store.draft = body.draft ?? {};
    await route.fulfill(json({ token: store.token, stage: store.stage, draft: store.draft }));
  });
  await page.route("**/v1/readiness/session/*", async (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON() ?? {};
      if (typeof body.stage === "string") store.stage = body.stage;
      if (body.draft && typeof body.draft === "object") store.draft = body.draft;
    }
    await route.fulfill(json({ token: store.token, stage: store.stage, draft: store.draft }));
  });
  await page.route("**/api/readiness/token", (route) => route.fulfill(json({ token: SUBMISSION_TOKEN })));
  await page.route("**/api/readiness/start", (route) =>
    route.fulfill(json({ ok: true, run_id: "run-cap-1" })),
  );
  await page.route("**/api/readiness/status**", (route) => route.fulfill(json({ status: "pending" })));
  await page.route("**/api/readiness/submit", (route) => route.fulfill(json({ message: "received" })));
  // Analytics beacon isn't part of this fix and has no local-dev handler; ack it
  // so the mocked run doesn't log spurious 404s (it 2xx's on the live backend).
  await page.route("**/v1/analytics", (route) => route.fulfill(json({ ok: true })));
  await page.route("**/v1/readiness/parse", (route) =>
    route.fulfill(
      json({
        parseStatus: "ok",
        stack: "TypeScript, Next.js",
        size: "Small",
        findings: ["Auth hardening needed", "Add rate limiting"],
      }),
    ),
  );
}

const consoleMessages = [];
const requests = [];

async function run() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on("console", (msg) => {
    consoleMessages.push({ type: msg.type(), text: msg.text() });
  });
  page.on("pageerror", (err) => {
    consoleMessages.push({ type: "pageerror", text: String(err) });
  });
  page.on("requestfinished", async (req) => {
    const res = await req.response();
    requests.push({ method: req.method(), url: req.url(), status: res ? res.status() : null });
  });
  page.on("requestfailed", (req) => {
    requests.push({ method: req.method(), url: req.url(), status: "FAILED", failure: req.failure()?.errorText });
  });

  if (!LIVE) await installMockRoutes(page);

  await page.goto(`${BASE_URL}/readiness`, { waitUntil: "domcontentloaded" });

  // Project step → name a fresh project → start → continue into intake.
  await page.getByTestId("readiness-project").waitFor({ state: "visible", timeout: 30000 });
  await page.screenshot({ path: resolve(shotsDir, "capture-01-project-step.png"), fullPage: true });
  await page.getByTestId("readiness-project-new-option").check();
  await page.getByTestId("readiness-project-new-input").fill("Clinic Scheduler (capture)");
  await page.getByTestId("readiness-project-start").click();
  await page.getByTestId("readiness-project-continue").click();

  // 5-step intake.
  await page.getByTestId("readiness-q1").fill(COMPLETE_STAGE1.productDescription);
  await page.getByTestId("readiness-continue").click();
  await page.locator(`input[name="whoUses"][value="${COMPLETE_STAGE1.whoUses}"]`).check();
  await page.getByTestId("readiness-continue").click();
  await page.locator(`input[name="builtWith"][value="${COMPLETE_STAGE1.builtWith}"]`).check();
  await page.getByTestId("readiness-continue").click();
  await page.locator(`input[name="blockers"][value="${COMPLETE_STAGE1.blockers[0]}"]`).check();
  await page.getByTestId("readiness-continue").click();
  await page.locator(`input[name="deadline"][value="${COMPLETE_STAGE1.deadline}"]`).check();
  await page.getByTestId("readiness-continue").click();

  // Stage 2 — diagnostic prompt.
  await page.getByTestId("readiness-stage2").waitFor({ state: "visible", timeout: 30000 });
  await page.screenshot({ path: resolve(shotsDir, "capture-02-stage2-prompt.png"), fullPage: true });
  const stage2Prompt = (await page.getByTestId("readiness-prompt-block").innerText()).trim();

  // Advance to Stage 3 — paste results — and confirm the prompt is shown here too.
  await page.getByTestId("readiness-go-paste").click();
  const stage3 = page.locator('div.readiness-assessment[data-testid="readiness-stage3"]');
  await stage3.waitFor({ state: "visible", timeout: 30000 });
  const stage3PromptBlock = page.getByTestId("readiness-stage3-prompt-block");
  await stage3PromptBlock.waitFor({ state: "visible", timeout: 30000 });
  const stage3Prompt = (await stage3PromptBlock.innerText()).trim();
  await page.screenshot({ path: resolve(shotsDir, "capture-03-stage3-prompt.png"), fullPage: true });

  await browser.close();

  const consoleErrors = consoleMessages.filter((m) => m.type === "error" || m.type === "pageerror");
  const appRequests = requests.filter((r) => {
    try {
      const host = new URL(r.url).host;
      return host === new URL(BASE_URL).host || /readiness/.test(r.url);
    } catch {
      return false;
    }
  });
  const failedRequests = appRequests.filter(
    (r) => r.status === "FAILED" || (typeof r.status === "number" && r.status >= 400),
  );

  const summary = {
    baseUrl: BASE_URL,
    mode: LIVE ? "live-backend" : "mocked-backend",
    stage3PromptShown: stage3Prompt.includes("VYGO READINESS DIAGNOSTIC PROMPT"),
    stage3PromptLength: stage3Prompt.length,
    stage2PromptLength: stage2Prompt.length,
    promptMatchesStage2: stage3Prompt === stage2Prompt,
    consoleErrorCount: consoleErrors.length,
    consoleErrors,
    totalRequests: requests.length,
    appRequestCount: appRequests.length,
    failedRequestCount: failedRequests.length,
    failedRequests,
  };

  writeFileSync(resolve(consoleDir, "stage3-prompt.console.json"), JSON.stringify(consoleMessages, null, 2));
  writeFileSync(resolve(networkDir, "stage3-prompt.requests.json"), JSON.stringify(requests, null, 2));
  writeFileSync(resolve(networkDir, "stage3-prompt.app-requests.json"), JSON.stringify(appRequests, null, 2));
  writeFileSync(resolve(outDir, "stage3-capture-summary.json"), JSON.stringify(summary, null, 2));

  console.log(JSON.stringify(summary, null, 2));
  if (!summary.stage3PromptShown) {
    console.error("FAIL: Stage 3 prompt block did not contain the generated diagnostic prompt");
    process.exit(1);
  }
  if (summary.consoleErrorCount > 0) {
    console.error("FAIL: console errors observed");
    process.exit(1);
  }
  console.log("OK: Stage 3 shows the generated diagnostic prompt; no console errors.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
