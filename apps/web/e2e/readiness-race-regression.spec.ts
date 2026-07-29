import { test, expect, type Page, type Route } from "@playwright/test";
import path from "node:path";
import { installTurnstileStub } from "./helpers";

/**
 * End-to-end regression scenario for the former readiness-state race.
 *
 * This is the single cohesive walk the mission asks for — every checkpoint
 * exercised in one uninterrupted run against the live-served ReadinessFlow
 * (only the readiness backend is mocked at the browser boundary, the same
 * convention readiness-state.spec.ts uses). It seeds a persisted, COMPLETED
 * Step 8 / gate run, then proves in order:
 *
 *   1. /readiness?new=1 opens a clean, isolated prompt state with a fresh run id
 *      and none of the seeded Step 8 findings leaking through.
 *   2. The pause for user action (prompt_displayed / Stage 2) holds until the
 *      user manually proceeds to the paste step — nothing auto-advances.
 *   3. Submitting exactly "Analysis completed." is REJECTED with a recoverable
 *      validation message while the paste input stays available for correction —
 *      no findings, no progress.
 *   4. Correcting to a syntactically valid marker-delimited VYGO-READINESS-REPORT
 *      reaches Step 8 (report_parsed) and renders STRUCTURED findings, not the
 *      unparsed report text.
 *   5. A second /readiness?new=1 is again clean, with no findings/progress leaked
 *      from the successful report flow.
 *   6. A plain /readiness (no ?new=1) resumes the valid in-progress state at
 *      Step 8 with the SAME structured findings.
 *
 * Objective screenshots are captured at each checkpoint into
 * evidence/readiness-race-regression/screenshots so a live run leaves a durable
 * visual record of the pause, the invalid-report recovery, the valid-report
 * Step 8 result, the clean second fresh start, and the preserved resume.
 */

// Screenshots land under the repo evidence tree. Playwright's cwd is apps/web,
// so this resolves to <repo>/evidence/readiness-race-regression/screenshots.
const SHOTS = path.resolve(
  process.cwd(),
  "..",
  "..",
  "evidence",
  "readiness-race-regression",
  "screenshots",
);
async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

const SESSION_TOKEN = "race-session-token-000000000000000000";
const SUBMISSION_TOKEN = "race-submission-token-1111111111";

const COMPLETE_STAGE1 = {
  productDescription: "A scheduling SaaS for clinics with paying customers.",
  whoUses: "External users paying",
  builtWith: "Cursor",
  blockers: ["security questionnaire or review blocking a deal"],
  deadline: "No hard deadline",
  deadlineDetail: "",
};

// A complete, schema-valid marker-delimited v1 report. The strict paste boundary
// (validateReadinessReportPaste) accepts ONLY a report carrying both exact marker
// lines that also parses against the v1 schema, so every field is present.
const VALID_REPORT = [
  "=== VYGO-READINESS-REPORT v1 ===",
  "summary: Scheduling SaaS for multi-location clinics",
  "languages: TypeScript, Python",
  "size: medium (~40k LOC monorepo)",
  "structure: pnpm monorepo: web, api, worker, packages",
  "frontend: Next.js App Router",
  "backend: Fastify on Railway",
  "database: Postgres with Drizzle migrations",
  "tenancy: multi-tenant (org_id on rows)",
  "auth: session cookies + magic link",
  "authorization: RBAC roles (owner, admin, member)",
  "row_level_security: enforced via app middleware; RLS planned",
  "environments: local, staging, production",
  "deploys: GitHub Actions -> Vercel + Railway, automated",
  "tests: unit + integration on every deploy via CI",
  "background_jobs: email outbox worker",
  "integrations: Resend, Cloudflare Turnstile",
  "secrets_pattern: Railway env + Vault references (no secrets in git)",
  "logging: structured JSON logs, request ids",
  "error_handling: safe public errors; details only in server logs",
  "pii_categories: email, name; no payment card or health records in prod",
  "api_surface: HTTPS /v1/* JSON API",
  'fragility_flags: ["manual_migrate_risk", "single_region"]',
  "confidence: 0.82",
  "=== END VYGO-READINESS-REPORT ===",
].join("\n");

// The findings the mocked parse returns and the Step 8 view renders. Persisted
// verbatim by the confirm stage, so the resumed Step 8 shows the identical set.
const PARSED_FINDINGS = [
  "Auth: session cookies + magic link",
  "Database: Postgres with Drizzle migrations",
  "Deploy: GitHub Actions -> Vercel + Railway, automated",
  "Tests: unit + integration on every deploy via CI",
  "Tenancy: multi-tenant (org_id on rows)",
  "Secrets: Railway env + Vault references (no secrets in git)",
];

// Step 8 renders each finding as a STRUCTURED row (FindingsList / parseFindings):
// the "Area:" prefix becomes a chip and the body becomes a capitalized
// first-clause summary — the raw "Area: body" string is never a single text
// node. These are distinctive substrings of each rendered finding-summary, so
// asserting them proves the report was parsed into structured findings rather
// than dumped as unparsed report text.
const FINDING_SUMMARIES = [
  "session cookies + magic link",
  "Postgres with Drizzle migrations",
  "GitHub Actions",
  "unit + integration on every deploy",
  "multi-tenant (org_id on rows)",
  "Railway env + Vault references",
];

/**
 * Assert the confirm (Step 8) view rendered the parsed report as structured
 * finding rows — one row per finding, each distinctive summary visible — and
 * NOT as the raw marker-delimited report block.
 */
async function assertStructuredFindings(page: Page) {
  const confirm = page.getByTestId("readiness-confirm");
  const panel = confirm.getByTestId("readiness-confirm-findings");
  await expect(panel).toBeVisible();
  // Structured rows, not raw text: one row per finding.
  await expect(panel.getByTestId("finding-row")).toHaveCount(FINDING_SUMMARIES.length);
  for (const summary of FINDING_SUMMARIES) {
    await expect(panel.getByTestId("finding-summary").filter({ hasText: summary })).toBeVisible();
  }
  // The pending/raw fallback panel is never shown for a genuine "ok" parse.
  await expect(confirm.getByTestId("readiness-confirm-raw-fallback")).toHaveCount(0);
  // The verbatim marker block is not dumped into the view.
  await expect(confirm).not.toContainText("=== VYGO-READINESS-REPORT v1 ===");
}

// The structured report object the parse endpoint echoes back.
const PARSED_REPORT: Record<string, unknown> = {
  summary: "Scheduling SaaS for multi-location clinics",
  languages: "TypeScript, Python",
  size: "medium (~40k LOC monorepo)",
  structure: "pnpm monorepo: web, api, worker, packages",
  frontend: "Next.js App Router",
  backend: "Fastify on Railway",
  database: "Postgres with Drizzle migrations",
  tenancy: "multi-tenant (org_id on rows)",
  auth: "session cookies + magic link",
  authorization: "RBAC roles (owner, admin, member)",
  row_level_security: "enforced via app middleware; RLS planned",
  environments: "local, staging, production",
  deploys: "GitHub Actions -> Vercel + Railway, automated",
  tests: "unit + integration on every deploy via CI",
  background_jobs: "email outbox worker",
  integrations: "Resend, Cloudflare Turnstile",
  secrets_pattern: "Railway env + Vault references (no secrets in git)",
  logging: "structured JSON logs, request ids",
  error_handling: "safe public errors; details only in server logs",
  pii_categories: "email, name; no payment card or health records in prod",
  api_surface: "HTTPS /v1/* JSON API",
  fragility_flags: ["manual_migrate_risk", "single_region"],
  confidence: 0.82,
};

/** A persisted, COMPLETED Step 8 / gate run — the seed the fresh start must not leak. */
const PRIOR_STEP8_STATE = {
  token: "prior-completed-token-8888888888",
  stage: "gate",
  stage1: COMPLETE_STAGE1,
  pasteText: "VYGO-READINESS-REPORT: prior findings the new run must not restore.",
  findings: ["Prior auth finding", "Prior rate-limit finding"],
  parseStatus: "ok",
  confirmedAt: "2026-01-01T00:00:00.000Z",
  completed: true,
  progress: 100,
  runId: "run_prior_completed",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function json(body: unknown, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify(body) };
}

type Session = { token: string; stage: string; draft: Record<string, unknown> };

/**
 * A faithful multi-session store: each POST /session mints a DISTINCT token with
 * its own row, exactly like the real backend. This is what makes a `?new=1`
 * clean start isolate itself (a fresh token/row) while leaving the prior valid
 * session's row — and its persisted confirm draft — intact and resumable. A
 * single shared row would instead let the new run overwrite the old draft, which
 * would not model the real backend and would mask the resume-after-new=1 fix.
 *
 * `.stage`/`.draft` reflect the most-recently-touched (active) session so the
 * existing `expect.poll(() => store.stage)` assertions keep working, and
 * `.sessionFor(token)` exposes any individual row.
 */
function createSessionStore() {
  const sessions = new Map<string, Session>();
  let counter = 0;
  let activeToken = "";

  function touch(token: string): Session {
    let s = sessions.get(token);
    if (!s) {
      s = { token, stage: "intake", draft: {} };
      sessions.set(token, s);
    }
    activeToken = token;
    return s;
  }

  return {
    mint(): Session {
      counter += 1;
      const token = counter === 1 ? SESSION_TOKEN : `${SESSION_TOKEN}-${counter}`;
      return touch(token);
    },
    touch,
    sessionFor(token: string) {
      return sessions.get(token);
    },
    get stage() {
      return sessions.get(activeToken)?.stage ?? "intake";
    },
    get draft() {
      return sessions.get(activeToken)?.draft ?? {};
    },
    get count() {
      return sessions.size;
    },
  };
}

function tokenFromUrl(url: string): string {
  return decodeURIComponent(url.split("?")[0].split("/").pop() ?? "");
}

/**
 * Install the mocked readiness backend. The session store round-trips stage +
 * draft per token so a plain-reload resume reads back exactly what the confirm
 * stage persisted. The parse endpoint returns a genuine "ok" structured result.
 */
async function installRoutes(page: Page) {
  const store = createSessionStore();

  await page.route("**/v1/readiness/session", async (route: Route) => {
    if (route.request().method() !== "POST") return route.continue();
    const body = (route.request().postDataJSON() ?? {}) as {
      stage?: string;
      draft?: Record<string, unknown>;
    };
    // A fresh POST creates a brand-new session row with its own token.
    const session = store.mint();
    session.stage = body.stage ?? "intake";
    session.draft = body.draft ?? {};
    await route.fulfill(json({ token: session.token, stage: session.stage, draft: session.draft }));
  });

  await page.route("**/v1/readiness/session/*", async (route: Route) => {
    const token = tokenFromUrl(route.request().url());
    const session = store.touch(token);
    if (route.request().method() === "PATCH") {
      const body = (route.request().postDataJSON() ?? {}) as {
        stage?: string;
        draft?: Record<string, unknown>;
      };
      if (typeof body.stage === "string") session.stage = body.stage;
      if (body.draft && typeof body.draft === "object") session.draft = body.draft;
    }
    await route.fulfill(json({ token: session.token, stage: session.stage, draft: session.draft }));
  });

  await page.route("**/api/readiness/token", async (route: Route) => {
    await route.fulfill(json({ token: SUBMISSION_TOKEN }));
  });
  await page.route("**/api/readiness/start", async (route: Route) => {
    await route.fulfill(json({ ok: true, run_id: "run-race-1" }));
  });
  // Background ingest never lands — the valid path is entirely user-driven.
  await page.route("**/api/readiness/status**", async (route: Route) => {
    await route.fulfill(json({ status: "pending" }));
  });
  await page.route("**/api/readiness/submit", async (route: Route) => {
    await route.fulfill(json({ message: "received" }));
  });
  await page.route("**/v1/readiness/parse", async (route: Route) => {
    await route.fulfill(
      json({
        parseStatus: "ok",
        stack: "TypeScript, Python",
        size: "medium (~40k LOC monorepo)",
        findings: PARSED_FINDINGS,
        report: PARSED_REPORT,
      }),
    );
  });

  return { store };
}

async function completeIntake(page: Page) {
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
}

async function startProjectRun(page: Page, project: string) {
  await expect(page.getByTestId("readiness-project")).toBeVisible();
  await page.getByTestId("readiness-project-new-option").check();
  await page.getByTestId("readiness-project-new-input").fill(project);
  await page.getByTestId("readiness-project-start").click();
  await page.getByTestId("readiness-project-continue").click();
  await expect(page.getByTestId("readiness-stage1")).toBeVisible();
}

function readState(page: Page) {
  return page.evaluate(() => document.documentElement.dataset.readinessState ?? null);
}

function readStoredRunId(page: Page) {
  return page.evaluate(() => {
    try {
      const raw = window.localStorage.getItem("vygo:readiness:v1");
      if (!raw) return null;
      return (JSON.parse(raw) as { runId?: string | null }).runId ?? null;
    } catch {
      return null;
    }
  });
}

function seedPriorStep8(page: Page) {
  return page.addInitScript(
    ({ key, state }) => window.localStorage.setItem(key, JSON.stringify(state)),
    { key: "vygo:readiness:v1", state: PRIOR_STEP8_STATE },
  );
}

const stage3Of = (page: Page) =>
  page.locator('div.readiness-assessment[data-testid="readiness-stage3"]');

test.describe("readiness race regression — full cohesive scenario", () => {
  test("seeded Step 8 → clean fresh start → pause → invalid recovery → valid Step 8 → clean restart → resume", async ({
    page,
  }) => {
    await seedPriorStep8(page);
    const { store } = await installRoutes(page);
    await installTurnstileStub(page);

    // --- 1. /readiness?new=1 is a clean, isolated fresh start -----------------
    await page.goto("/readiness?new=1");
    await expect(page.getByTestId("readiness-project")).toBeVisible();
    await expect.poll(() => readState(page)).toBe("intake");
    // None of the seeded completed run leaks in.
    await expect(page.getByTestId("readiness-confirm")).toHaveCount(0);
    await expect(page.getByTestId("readiness-score-gate")).toHaveCount(0);
    await expect.poll(() => readStoredRunId(page)).not.toBeNull();
    const firstRunId = await readStoredRunId(page);
    expect(firstRunId).not.toBe(PRIOR_STEP8_STATE.runId);
    await shot(page, "01-fresh-start-clean-prompt");

    // Walk intake to the pause for user action (Stage 2 / prompt_displayed).
    await startProjectRun(page, "Race Regression Project");
    await completeIntake(page);

    // --- 2. The pause for user action holds until the user proceeds -----------
    await expect(page.getByTestId("readiness-stage2")).toBeVisible();
    await expect.poll(() => readState(page)).toBe("prompt_displayed");
    await expect(page.getByTestId("readiness-stage2")).toHaveAttribute(
      "data-readiness-state",
      "prompt_displayed",
    );
    // Nothing auto-advanced past the pause.
    await expect(page.getByTestId("readiness-confirm")).toHaveCount(0);
    await expect(page.getByTestId("readiness-score-gate")).toHaveCount(0);
    await shot(page, "02-pause-for-user-action");

    // Manually proceed to the paste step.
    await page.getByTestId("readiness-go-paste").click();
    await expect.poll(() => readState(page)).toBe("user_ready_to_paste");
    await expect(stage3Of(page).getByTestId("readiness-paste-textarea")).toBeVisible();

    // --- 3. "Analysis completed." is rejected, recoverably -------------------
    const stage3 = stage3Of(page);
    await stage3.getByTestId("readiness-paste-textarea").fill("Analysis completed.");
    await stage3.getByTestId("readiness-paste-submit").click();

    // A recoverable validation rejection is shown; the paste input stays put.
    await expect(page.getByTestId("readiness-paste-validation")).toBeVisible();
    await expect(stage3.getByTestId("readiness-paste-textarea")).toHaveValue("Analysis completed.");
    await expect(stage3.getByTestId("readiness-paste-submit")).toBeVisible();
    // No progress: still at the paste step, no findings, no confirm/gate.
    await expect.poll(() => readState(page)).toBe("user_ready_to_paste");
    await expect(page.getByTestId("readiness-confirm")).toHaveCount(0);
    await expect(page.getByTestId("readiness-score-gate")).toHaveCount(0);
    await shot(page, "03-invalid-report-recoverable-rejection");

    // --- 4. A valid report reaches Step 8 with STRUCTURED findings -----------
    await stage3.getByTestId("readiness-paste-textarea").fill(VALID_REPORT);
    // The rejection clears as soon as the user corrects the paste.
    await expect(page.getByTestId("readiness-paste-validation")).toHaveCount(0);
    await stage3.getByTestId("readiness-paste-submit").click();

    await expect(page.getByTestId("readiness-confirm")).toBeVisible();
    await expect.poll(() => readState(page)).toBe("report_parsed");
    await expect(page.getByTestId("readiness-confirm")).toHaveAttribute(
      "data-readiness-state",
      "report_parsed",
    );
    // Rendered as structured findings — NOT the raw unparsed report block.
    await assertStructuredFindings(page);
    // The explicit confirmation control is available (report_parsed only).
    await expect(page.getByTestId("readiness-confirm-looks-right")).toBeVisible();
    // The valid in-progress state persisted as the resumable "confirm" stage.
    await expect.poll(() => store.stage).toBe("confirm");
    await shot(page, "04-valid-report-step8-structured-findings");

    // --- 5. A second /readiness?new=1 is clean again -------------------------
    await page.goto("/readiness?new=1");
    await expect(page.getByTestId("readiness-project")).toBeVisible();
    await expect.poll(() => readState(page)).toBe("intake");
    await expect(page.getByTestId("readiness-confirm")).toHaveCount(0);
    await expect(page.getByTestId("readiness-score-gate")).toHaveCount(0);
    // A different run id from the first fresh start — no leaked progress.
    await expect.poll(() => readStoredRunId(page)).not.toBe(firstRunId);
    const secondRunId = await readStoredRunId(page);
    expect(secondRunId).not.toBeNull();
    expect(secondRunId).not.toBe(firstRunId);
    await shot(page, "05-second-fresh-start-clean");
  });

  test("plain /readiness (no new=1) resumes the valid in-progress state at Step 8 with the same findings", async ({
    page,
  }) => {
    const { store } = await installRoutes(page);
    await installTurnstileStub(page);

    // Create a valid in-progress state: fresh start → prompt → paste a valid
    // report → Step 8 (report_parsed) with structured findings. Do NOT confirm.
    await page.goto("/readiness?new=1");
    await startProjectRun(page, "Resume At Step 8 Project");
    await completeIntake(page);
    await page.getByTestId("readiness-go-paste").click();
    const stage3 = stage3Of(page);
    await stage3.getByTestId("readiness-paste-textarea").fill(VALID_REPORT);
    await stage3.getByTestId("readiness-paste-submit").click();
    await expect(page.getByTestId("readiness-confirm")).toBeVisible();
    await expect.poll(() => readState(page)).toBe("report_parsed");
    await expect.poll(() => store.stage).toBe("confirm");

    const runIdBefore = await readStoredRunId(page);

    // Mirror the reported race window, then reload WITHOUT ?new=1.
    await page.waitForTimeout(500);
    await page.goto("/readiness");

    // Resumes the SAME valid in-progress state at Step 8 — not the paste step,
    // not a fresh intake, not the confirmed gate.
    await expect(page.getByTestId("readiness-confirm")).toBeVisible();
    await expect.poll(() => readState(page)).toBe("report_parsed");
    await expect(page.getByTestId("readiness-score-gate")).toHaveCount(0);
    await expect(page.getByTestId("readiness-project")).toHaveCount(0);
    // The identical structured findings are restored, still not raw report text.
    await assertStructuredFindings(page);
    // The resumed run keeps its identity.
    await expect.poll(() => readStoredRunId(page)).toBe(runIdBefore);
    await shot(page, "06-plain-reload-resumes-step8");
  });

  // BUG-1: the resumable valid session must be preserved SEPARATELY from the
  // clean-start session. A ?new=1 clean start (which overwrites the main
  // localStorage key to isolate a fresh run) must NOT destroy the saved resume
  // token / structured draft of a valid Step-8 session — so a following plain
  // /readiness (no ?new=1) still restores Step 8 with the SAME structured
  // findings instead of dropping back to a fresh Step 1.
  test("valid Step 8 → second new=1 clean start → plain /readiness still resumes Step 8 with the same findings", async ({
    page,
  }) => {
    const { store } = await installRoutes(page);
    await installTurnstileStub(page);

    // Create a valid in-progress state at Step 8 (report_parsed) with structured
    // findings via a clean ?new=1 start.
    await page.goto("/readiness?new=1");
    await startProjectRun(page, "Preserve Resume Project");
    await completeIntake(page);
    await page.getByTestId("readiness-go-paste").click();
    const stage3 = stage3Of(page);
    await stage3.getByTestId("readiness-paste-textarea").fill(VALID_REPORT);
    await stage3.getByTestId("readiness-paste-submit").click();
    await expect(page.getByTestId("readiness-confirm")).toBeVisible();
    await expect.poll(() => readState(page)).toBe("report_parsed");
    await expect.poll(() => store.stage).toBe("confirm");
    await assertStructuredFindings(page);
    const resumableRunId = await readStoredRunId(page);
    expect(resumableRunId).not.toBeNull();
    // The valid session lives in its own backend row — a fresh start below mints
    // a distinct row, it does not overwrite this one.
    const rowsAfterValid = store.count;

    // --- A second ?new=1 is a clean, isolated Step 1 start -------------------
    await page.goto("/readiness?new=1");
    await expect(page.getByTestId("readiness-project")).toBeVisible();
    await expect.poll(() => readState(page)).toBe("intake");
    await expect(page.getByTestId("readiness-confirm")).toHaveCount(0);
    await expect(page.getByTestId("readiness-score-gate")).toHaveCount(0);
    // A different run id — none of the valid Step-8 progress leaked in.
    await expect.poll(() => readStoredRunId(page)).not.toBe(resumableRunId);
    const cleanStartRunId = await readStoredRunId(page);
    expect(cleanStartRunId).not.toBe(resumableRunId);
    // The clean start opened a NEW session row; the valid session's row survives.
    expect(store.count).toBeGreaterThan(rowsAfterValid);
    await shot(page, "07-new1-after-valid-stays-clean");

    // --- A following plain /readiness resumes the PRESERVED Step 8 session ----
    await page.goto("/readiness");
    await expect(page.getByTestId("readiness-confirm")).toBeVisible();
    await expect.poll(() => readState(page)).toBe("report_parsed");
    // Not the clean-start intake, not the paste step, not the score gate.
    await expect(page.getByTestId("readiness-project")).toHaveCount(0);
    await expect(page.getByTestId("readiness-score-gate")).toHaveCount(0);
    // The SAME structured findings from the preserved valid session are restored.
    await assertStructuredFindings(page);
    // Resumed with the original valid run's identity — not the clean-start run.
    await expect.poll(() => readStoredRunId(page)).toBe(resumableRunId);
    await shot(page, "08-plain-readiness-resumes-preserved-step8");
  });
});
