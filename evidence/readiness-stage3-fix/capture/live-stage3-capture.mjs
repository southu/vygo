/**
 * Live-browser capture of the Readiness Check Stage 3 (diagnostic-prompt /
 * data-gathering) flow on the DEPLOYED site (https://www.vygo.ai), the
 * equivalent of e2e/capture-console.js for this fix.
 *
 * Unlike the Playwright regression specs (which mock the backend to drive the
 * client state machine deterministically), this driver hits the REAL deployed
 * backend end-to-end: it creates a real anonymous readiness session, mints a
 * real per-session submission token, starts a run, and polls the real ingest
 * status endpoint — exactly what a real visitor does. No scoring, no email, no
 * PII is submitted; it stops at the paste step (before the Turnstile score gate).
 *
 * It proves the two shipped fixes against production:
 *   1. Stage 3 shows the generated diagnostic prompt (readiness-prompt-block,
 *      "VYGO READINESS DIAGNOSTIC PROMPT") and an "awaiting paste" waiting state
 *      — it does NOT jump straight to the failed/expired state on a freshly
 *      minted submission token (the read-after-write race the fix guards).
 *   2. A "New analysis" restart over the just-generated analysis resets cleanly
 *      to the project step with no stale prompt/paste leaking.
 *
 * Captured artifacts (written next to this script):
 *   - screenshots/*.png   — project step, Stage 3 prompt view, paste view, restart
 *   - console/*.txt       — full browser console stream (all levels)
 *   - network/*.json      — every request with method/url/status (failures flagged)
 *   - capture-summary.json — machine-readable pass/fail of each assertion
 *
 * Usage: node evidence/readiness-stage3-fix/capture/live-stage3-capture.mjs
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(import.meta.url);
// evidence/readiness-stage3-fix/capture -> repo root is three dirs up.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const { chromium } = require(
  process.env.PW_PKG || path.join(repoRoot, "apps/web/node_modules/@playwright/test"),
);

const BASE = process.env.LIVE_URL || "https://www.vygo.ai";
const DIR = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(DIR, "..", "screenshots");
const CONSOLE = path.join(DIR, "..", "console");
const NETWORK = path.join(DIR, "..", "network");
for (const d of [SHOTS, CONSOLE, NETWORK]) fs.mkdirSync(d, { recursive: true });

// Same complete, non-off-ramp intake the regression spec uses (Cursor → Variant A).
const STAGE1 = {
  productDescription: "A scheduling SaaS for clinics with paying customers.",
  whoUses: "External users paying",
  builtWith: "Cursor",
  blocker: "security questionnaire or review blocking a deal",
  deadline: "No hard deadline",
};

/** Network requests we consider "app" traffic (same-origin API + page docs). */
function isAppRequest(url) {
  return (
    url.startsWith(BASE) &&
    (url.includes("/api/readiness/") ||
      url.includes("/v1/readiness/") ||
      url.includes("/readiness"))
  );
}

async function main() {
  const summary = {
    base: BASE,
    startedAt: new Date().toISOString(),
    assertions: {},
    consoleErrors: [],
    failedRequests: [],
    appRequests: [],
  };

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const consoleLines = [];
  page.on("console", (msg) => {
    const type = msg.type();
    const text = msg.text();
    consoleLines.push(`[${type}] ${text}`);
    // Next.js hydration/dev noise aside, treat error/warning as notable; only
    // error-level counts against acceptance #4 (zero JS console errors).
    if (type === "error") summary.consoleErrors.push(text);
  });
  page.on("pageerror", (err) => {
    consoleLines.push(`[pageerror] ${err.message}`);
    summary.consoleErrors.push(String(err.message));
  });

  const requests = [];
  page.on("requestfinished", async (req) => {
    try {
      const res = await req.response();
      const status = res ? res.status() : 0;
      const url = req.url();
      const rec = { method: req.method(), url, status };
      requests.push(rec);
      if (isAppRequest(url)) summary.appRequests.push(rec);
      // A failed app request = network error or 4xx/5xx on same-origin app traffic.
      if (isAppRequest(url) && status >= 400) summary.failedRequests.push(rec);
    } catch {
      /* ignore */
    }
  });
  page.on("requestfailed", (req) => {
    const url = req.url();
    const rec = { method: req.method(), url, status: "FAILED", error: req.failure()?.errorText };
    requests.push(rec);
    // Ignore benign aborted analytics/beacon; flag app traffic only.
    if (isAppRequest(url)) summary.failedRequests.push(rec);
  });

  const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });

  // ---- 1. Land on the fresh project step (?new=1 guarantees a clean start). ----
  await page.goto(`${BASE}/readiness?new=1`, { waitUntil: "networkidle" });
  await page.getByTestId("readiness-project").waitFor({ state: "visible", timeout: 30_000 });
  await shot("01-project-step");
  summary.assertions.projectStepVisible = true;

  // Name a brand-new project so the "existing project" mode never pre-selects.
  await page.getByTestId("readiness-project-new-option").check();
  await page
    .getByTestId("readiness-project-new-input")
    .fill(`Live Capture ${new Date().toISOString().slice(0, 19)}`);
  await page.getByTestId("readiness-project-start").click();
  await page.getByTestId("readiness-project-continue").click();

  // ---- 2. Drive the 5-step Stage 1 intake against the real backend. ----
  await page.getByTestId("readiness-stage1").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByTestId("readiness-q1").fill(STAGE1.productDescription);
  await page.getByTestId("readiness-continue").click();
  await page.locator(`input[name="whoUses"][value="${STAGE1.whoUses}"]`).check();
  await page.getByTestId("readiness-continue").click();
  await page.locator(`input[name="builtWith"][value="${STAGE1.builtWith}"]`).check();
  await page.getByTestId("readiness-continue").click();
  await page.locator(`input[name="blockers"][value="${STAGE1.blocker}"]`).check();
  await page.getByTestId("readiness-continue").click();
  await page.locator(`input[name="deadline"][value="${STAGE1.deadline}"]`).check();
  await page.getByTestId("readiness-continue").click();

  // ---- 3. Stage 3 / diagnostic-prompt view: the generated prompt must show. ----
  const stage2 = page.getByTestId("readiness-stage2");
  await stage2.waitFor({ state: "visible", timeout: 45_000 });
  const promptBlock = page.getByTestId("readiness-prompt-block");
  await promptBlock.waitFor({ state: "visible", timeout: 15_000 });
  const promptText = (await promptBlock.innerText()).trim();
  summary.assertions.promptBlockVisible = true;
  summary.assertions.promptContainsDiagnosticHeader = promptText.includes(
    "VYGO READINESS DIAGNOSTIC PROMPT",
  );
  summary.assertions.promptLength = promptText.length;

  // The waiting/ingest panel must be in an "awaiting" state, NOT the expired/failed
  // state — this is the core of fix #1 (no jump-to-failed before the prompt shows).
  // Give the real status poll several seconds to run at least once.
  await page.waitForTimeout(6_000);
  const expiredCount = await page.getByTestId("readiness-waiting-expired").count();
  const waitingStatusCount = await page.getByTestId("readiness-waiting-status").count();
  summary.assertions.noExpiredFailedState = expiredCount === 0;
  summary.assertions.awaitingStateShown = waitingStatusCount > 0;
  await shot("02-stage3-diagnostic-prompt");

  // ---- 4. Continue to the paste step (view === stage3). ----
  await page.getByTestId("readiness-go-paste").click();
  const stage3 = page.locator('div.readiness-assessment[data-testid="readiness-stage3"]');
  await stage3.waitFor({ state: "visible", timeout: 15_000 });
  summary.assertions.pasteStepVisible = true;
  await page.getByTestId("readiness-paste-textarea").waitFor({ state: "visible" });
  await shot("03-stage3-paste-step");

  // ---- 5. "New analysis" over the existing one resets cleanly (fix #2). ----
  await page.getByTestId("readiness-paste-back").click(); // back to the prompt view
  await stage2.waitFor({ state: "visible", timeout: 15_000 });
  await page.getByTestId("readiness-new-analysis").click();
  await page.getByTestId("readiness-project").waitFor({ state: "visible", timeout: 15_000 });
  const leakedStage2 = await page.getByTestId("readiness-stage2").count();
  const leakedPrompt = await page.getByTestId("readiness-prompt-block").count();
  const leakedPaste = await page.getByTestId("readiness-paste-textarea").count();
  summary.assertions.newAnalysisResetsToProject = true;
  summary.assertions.noStalePromptAfterReset = leakedStage2 === 0 && leakedPrompt === 0;
  summary.assertions.noStalePasteAfterReset = leakedPaste === 0;
  await shot("04-new-analysis-reset");

  summary.finishedAt = new Date().toISOString();
  summary.totalRequests = requests.length;

  // ---- Persist artifacts. ----
  fs.writeFileSync(path.join(CONSOLE, "live-stage3.console.txt"), consoleLines.join("\n") + "\n");
  fs.writeFileSync(
    path.join(NETWORK, "live-stage3.requests.json"),
    JSON.stringify(requests, null, 2),
  );
  fs.writeFileSync(
    path.join(NETWORK, "live-stage3.app-requests.json"),
    JSON.stringify(summary.appRequests, null, 2),
  );
  fs.writeFileSync(path.join(DIR, "..", "capture-summary.json"), JSON.stringify(summary, null, 2));

  await browser.close();

  // ---- Verdict. ----
  const pass =
    summary.assertions.promptBlockVisible &&
    summary.assertions.promptContainsDiagnosticHeader &&
    summary.assertions.noExpiredFailedState &&
    summary.assertions.pasteStepVisible &&
    summary.assertions.noStalePromptAfterReset &&
    summary.assertions.noStalePasteAfterReset &&
    summary.consoleErrors.length === 0 &&
    summary.failedRequests.length === 0;

  console.log(JSON.stringify(summary, null, 2));
  console.log(pass ? "\nCAPTURE PASS ✅" : "\nCAPTURE FAIL ❌");
  if (!pass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
