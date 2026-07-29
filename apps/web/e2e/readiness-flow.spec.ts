import { test, expect, type Page, type Route } from "@playwright/test";
import { installTurnstileStub } from "./helpers";

/**
 * Regression coverage for three recently fixed /readiness flow behaviours in
 * ReadinessFlow.tsx. Every backend call is mocked with page.route() (no real API,
 * no real Cloudflare challenge) in the same style as readiness-gate.spec.ts, so
 * these drive the real client state machine deterministically:
 *
 *  (a) A fresh single analysis walks project → intake → the diagnostic-prompt
 *      view (readiness-stage2) and renders a non-empty prompt block. Guards the
 *      "never jump Stage 3 to failed before the prompt is shown" / prompt-gen
 *      state fixes: if stage2 regressed, the prompt block never appears.
 *
 *  (b) Starting a NEW analysis when one already exists — via the in-page
 *      "New analysis" control (startNewAnalysis) AND via the ?new=1 entry point —
 *      resets in-page state back to the project-selection step with no stale
 *      prior-analysis prompt/paste visible, and a second run starts cleanly.
 *      Guards the ?new=1 isolation + prior-draft-clear fixes: a regression leaves
 *      the old prompt visible or blocks the restart.
 *
 *  (c) The Stage 3 paste-parse-failure raw fallback: pasting input that does not
 *      parse into structured findings surfaces the verbatim raw fallback panel,
 *      and the "continue with what we have" control advances past the failed
 *      parse (into the gate) instead of getting stuck or throwing. Guards the
 *      isMalformedStructuredPaste / showRawFallback path.
 *
 * All tokens/emails are synthetic literals — no real secrets or environment paths.
 */

/** Synthetic session token (>= 16 chars so ReadinessFlow's resume guard accepts it). */
const SESSION_TOKEN = "flow-session-token-0000000000000000";
/** Synthetic per-session submission token minted by /api/readiness/token. */
const SUBMISSION_TOKEN = "flow-submission-token-1111111111";
/** Deep-link token used to resume straight into the Stage 3 paste view. */
const STAGE3_TOKEN = "flow-stage3-token-2222222222222222";

/** A complete, non-off-ramp intake draft (Cursor → Variant A prompt). */
const COMPLETE_STAGE1 = {
  productDescription: "A scheduling SaaS for clinics with paying customers.",
  whoUses: "External users paying",
  builtWith: "Cursor",
  blockers: ["security questionnaire or review blocking a deal"],
  deadline: "No hard deadline",
  deadlineDetail: "",
};

function json(body: unknown, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify(body) };
}

/**
 * Mutable in-memory session store backing the mocked session endpoints so a
 * PATCH-then-reload behaves like the real backend. Seeded per test.
 */
type SessionStore = { token: string; stage: string; draft: Record<string, unknown> };

/**
 * Install the full mocked readiness backend surface. Returns the session store
 * (so a test can inspect what stage/draft the client persisted) plus a handle to
 * override the /v1/readiness/parse response (used to force a parse failure).
 */
async function installReadinessRoutes(
  page: Page,
  init: { stage?: string; draft?: Record<string, unknown>; token?: string } = {},
) {
  const store: SessionStore = {
    token: init.token ?? SESSION_TOKEN,
    stage: init.stage ?? "intake",
    draft: init.draft ?? {},
  };
  // Configurable parse result; defaults to a clean "ok" so the normal path works.
  const parse = {
    status: 200,
    body: {
      parseStatus: "ok",
      stack: "TypeScript, Next.js",
      size: "Small",
      findings: ["Auth hardening needed", "Add rate limiting"],
    } as Record<string, unknown>,
  };

  // POST /v1/readiness/session — create a fresh session row.
  await page.route("**/v1/readiness/session", async (route: Route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    const body = (route.request().postDataJSON() ?? {}) as {
      stage?: string;
      draft?: Record<string, unknown>;
    };
    store.stage = body.stage ?? "intake";
    store.draft = body.draft ?? {};
    await route.fulfill(json({ token: store.token, stage: store.stage, draft: store.draft }));
  });

  // GET / PATCH /v1/readiness/session/<token> — resume + persist.
  await page.route("**/v1/readiness/session/*", async (route: Route) => {
    const method = route.request().method();
    if (method === "PATCH") {
      const body = (route.request().postDataJSON() ?? {}) as {
        stage?: string;
        draft?: Record<string, unknown>;
      };
      if (typeof body.stage === "string") store.stage = body.stage;
      if (body.draft && typeof body.draft === "object") store.draft = body.draft;
    }
    await route.fulfill(json({ token: store.token, stage: store.stage, draft: store.draft }));
  });

  // POST /api/readiness/token — mint the per-session submission credential.
  await page.route("**/api/readiness/token", async (route: Route) => {
    await route.fulfill(json({ token: SUBMISSION_TOKEN }));
  });

  // POST /api/readiness/start — run-start guardrail; 200 == a fresh run started.
  await page.route("**/api/readiness/start", async (route: Route) => {
    await route.fulfill(json({ ok: true, run_id: "run-flow-1" }));
  });

  // GET /api/readiness/status — ingest poll; stay "pending" so the prompt/awaiting
  // state holds and never flips to expired/failed during the test.
  await page.route("**/api/readiness/status**", async (route: Route) => {
    await route.fulfill(json({ status: "pending" }));
  });

  // POST /api/readiness/submit — best-effort ingest of pasted results.
  await page.route("**/api/readiness/submit", async (route: Route) => {
    await route.fulfill(json({ message: "received" }));
  });

  // POST /v1/readiness/parse — structured parse of the pasted report (overridable).
  await page.route("**/v1/readiness/parse", async (route: Route) => {
    await route.fulfill(json(parse.body, parse.status));
  });

  return {
    store,
    /** Force the next parse to report a genuine failure (no structured findings). */
    setParseFailure() {
      parse.status = 200;
      parse.body = { parseStatus: "manual", stack: "", size: "", findings: [] };
    },
  };
}

/** Drive the 5-step Stage 1 intake to completion (lands on the Stage 2 prompt). */
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

/** Start a run on the project step for a freshly named project, then enter intake. */
async function startProjectRun(page: Page, project: string) {
  await expect(page.getByTestId("readiness-project")).toBeVisible();
  // Always name a brand-new project (a remembered label from a prior run would
  // otherwise pre-select the "existing project" mode and hide the new-name field).
  await page.getByTestId("readiness-project-new-option").check();
  await page.getByTestId("readiness-project-new-input").fill(project);
  await page.getByTestId("readiness-project-start").click();
  await page.getByTestId("readiness-project-continue").click();
  await expect(page.getByTestId("readiness-stage1")).toBeVisible();
}

/**
 * The LIVE interactive Stage 3 panel. /readiness ships a static, readonly SSR
 * paste shell in page source (same readiness-stage3 / readiness-paste-* testids)
 * for the always-present-in-source acceptance, but that shell REMOVES itself once
 * the client hydrates (ReadinessStage3Shell) — so after hydration only the live
 * panel carries these testids. Scoping to the `.readiness-assessment` root keeps
 * actions unambiguous regardless.
 */
function liveStage3(page: Page) {
  return page.locator('div.readiness-assessment[data-testid="readiness-stage3"]');
}

test.describe("readiness flow — single analysis reaches the diagnostic prompt (a)", () => {
  test("project + intake completes and Stage 2 shows a non-empty prompt block", async ({
    page,
  }) => {
    await installReadinessRoutes(page);
    await installTurnstileStub(page);

    await page.goto("/readiness");
    await startProjectRun(page, "Clinic Scheduler");
    await completeIntake(page);

    const stage2 = page.getByTestId("readiness-stage2");
    await expect(stage2).toBeVisible();
    // The Stage 2 progress label must read as the diagnostic-prompt stage.
    await expect(stage2.getByText("Stage 2 of 3 — diagnostic prompt")).toBeVisible();

    const promptBlock = page.getByTestId("readiness-prompt-block");
    await expect(promptBlock).toBeVisible();
    // Non-empty, real generated prompt (not a blank/placeholder block).
    await expect(promptBlock).toContainText("VYGO READINESS DIAGNOSTIC PROMPT");
    expect((await promptBlock.innerText()).trim().length).toBeGreaterThan(50);
  });

  test("Stage 3 (paste results) also displays the generated diagnostic prompt", async ({
    page,
  }) => {
    await installReadinessRoutes(page);
    await installTurnstileStub(page);

    await page.goto("/readiness");
    await startProjectRun(page, "Clinic Scheduler");
    await completeIntake(page);

    // From the Stage 2 prompt view, advance to the Stage 3 paste step.
    await expect(page.getByTestId("readiness-stage2")).toBeVisible();
    await page.getByTestId("readiness-go-paste").click();

    const stage3 = liveStage3(page);
    await expect(stage3).toBeVisible();
    await expect(stage3.getByText("Stage 3 of 3 — paste results")).toBeVisible();

    // The generated diagnostic prompt is shown ON Stage 3 (mission requirement),
    // not only on Stage 2 — the paste step is self-contained.
    const stage3Prompt = page.getByTestId("readiness-stage3-prompt-block");
    await expect(stage3Prompt).toBeVisible();
    await expect(stage3Prompt).toContainText("VYGO READINESS DIAGNOSTIC PROMPT");
    expect((await stage3Prompt.innerText()).trim().length).toBeGreaterThan(50);

    // No failed/error state on the Stage 3 UI while the prompt + paste box show.
    await expect(page.getByTestId("readiness-parse-failed")).toHaveCount(0);
    await expect(page.getByTestId("readiness-stage2-generation-error")).toHaveCount(0);
    await expect(stage3.getByTestId("readiness-paste-textarea")).toBeVisible();
  });
});

test.describe("readiness flow — starting a new analysis over an existing one (b)", () => {
  test("in-page 'New analysis' control resets to the project step with no stale prompt, and a second run starts", async ({
    page,
  }) => {
    await installReadinessRoutes(page);
    await installTurnstileStub(page);

    // First analysis → diagnostic prompt.
    await page.goto("/readiness");
    await startProjectRun(page, "First Project");
    await completeIntake(page);
    await expect(page.getByTestId("readiness-prompt-block")).toBeVisible();

    // Use the in-flow "New analysis" / "Run again" affordance.
    await page.getByTestId("readiness-new-analysis").click();

    // Back on the project-selection step; no prior-analysis prompt/stage2 leaks.
    await expect(page.getByTestId("readiness-project")).toBeVisible();
    await expect(page.getByTestId("readiness-stage2")).toHaveCount(0);
    await expect(page.getByTestId("readiness-prompt-block")).toHaveCount(0);
    // Regression: the reset must leave ONLY the project-selection UI. The inert
    // SSR paste shell removes itself after hydration, so NO readiness-stage3 /
    // readiness-paste-textarea node survives on the project step — neither the
    // live interactive panel (would be the "leaked stage3" bug) nor a lingering
    // shell.
    await expect(liveStage3(page)).toHaveCount(0);
    await expect(page.getByTestId("readiness-stage3")).toHaveCount(0);
    await expect(page.getByTestId("readiness-paste-textarea")).toHaveCount(0);

    // A second run starts cleanly and reaches its own fresh prompt — the intake
    // steps start empty (project step, empty Stage 1), not pre-filled from run 1.
    await startProjectRun(page, "Second Project");
    await expect(page.getByTestId("readiness-q1")).toHaveValue("");
    await completeIntake(page);
    await expect(page.getByTestId("readiness-prompt-block")).toBeVisible();
  });

  test("?new=1 entry point ignores a prior local analysis and starts fresh on the project step", async ({
    page,
  }) => {
    await installReadinessRoutes(page);
    await installTurnstileStub(page);

    // Seed a prior, completed analysis in localStorage (stale prompt-stage draft
    // with paste text) before the app boots — the exact state ?new=1 must not leak.
    await page.addInitScript(
      ({ key, state }) => {
        window.localStorage.setItem(key, JSON.stringify(state));
      },
      {
        key: "vygo:readiness:v1",
        state: {
          token: "prior-analysis-token-9999999999999999",
          stage: "prompt",
          stage1: COMPLETE_STAGE1,
          pasteText: "PRIOR ANALYSIS PASTE — must not appear in the new run",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    );

    await page.goto("/readiness?new=1");

    // Lands on the fresh project-selection step, not the prior prompt/paste view.
    await expect(page.getByTestId("readiness-project")).toBeVisible();
    await expect(page.getByTestId("readiness-stage2")).toHaveCount(0);
    await expect(page.getByTestId("readiness-prompt-block")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("PRIOR ANALYSIS PASTE");
    // Regression for the reported ?new=1 defect: the project step rendered stale
    // readiness-stage3 / readiness-paste-textarea nodes alongside the fresh
    // project step. After hydration the SSR shell removes itself and no live
    // panel is mounted here, so the project step shows project selection only.
    await expect(liveStage3(page)).toHaveCount(0);
    await expect(page.getByTestId("readiness-stage3")).toHaveCount(0);
    await expect(page.getByTestId("readiness-paste-textarea")).toHaveCount(0);

    // And a brand-new analysis can be started successfully from here.
    await startProjectRun(page, "Fresh After New");
    await expect(page.getByTestId("readiness-q1")).toHaveValue("");
  });
});

test.describe("readiness flow — Stage 3 paste-parse failure raw fallback (c)", () => {
  test("malformed paste shows the verbatim raw fallback and offers ONLY re-paste — never advances past the failed parse", async ({
    page,
  }) => {
    const routes = await installReadinessRoutes(page, {
      token: STAGE3_TOKEN,
      stage: "stage3",
      draft: { stage1: COMPLETE_STAGE1, project: "Parse Failure Project", pasteText: "" },
    });
    // The server-side parse reports a genuine failure (no structured findings).
    routes.setParseFailure();
    await installTurnstileStub(page);

    // Deep-link straight to the Stage 3 paste view by resuming a stage3 session.
    await page.goto(`/readiness?token=${STAGE3_TOKEN}`);
    const stage3 = liveStage3(page);
    await expect(stage3).toBeVisible();

    // JSON-shaped but truncated → malformed structured paste (no real secrets).
    const malformed =
      '{"stack":{"languages":["TypeScript","Next.js"]},"findings":[{"severity":"high","title":"No auth on admin route"';
    await stage3.getByTestId("readiness-paste-textarea").fill(malformed);
    await stage3.getByTestId("readiness-paste-submit").click();

    // Raw fallback appears with the verbatim pasted text — no scraped partial.
    const fallback = page.getByTestId("readiness-confirm-raw-fallback");
    await expect(fallback).toBeVisible();
    const rawText = page.getByTestId("readiness-confirm-raw-text");
    await expect(rawText).toBeVisible();
    await expect(rawText).toHaveText(malformed);

    // A failed parse must NOT expose the findings-confirmation control and must
    // NOT advance to the gate: report_parsed / findings_confirmed require a
    // genuine successful parse. Only a re-paste path is offered.
    await expect(page.getByTestId("readiness-confirm-looks-right")).toHaveCount(0);
    await expect(page.getByTestId("readiness-score-gate")).toHaveCount(0);
    await expect(page.getByTestId("readiness-confirm-repaste")).toBeVisible();

    // Re-paste returns to the paste step so the user can supply a readable report.
    await page.getByTestId("readiness-confirm-repaste").click();
    await expect(liveStage3(page)).toBeVisible();
    await expect(page.getByTestId("readiness-score-gate")).toHaveCount(0);
  });

  test("the existing score-gate deep link still renders (paste/confirm changes did not regress the gate)", async ({
    page,
  }) => {
    // Guardrail mirroring readiness-gate.spec.ts: resuming a gate-stage session
    // must still render the verify-human gate after the confirm-view changes.
    await installReadinessRoutes(page, {
      token: STAGE3_TOKEN,
      stage: "gate",
      draft: {
        stage1: COMPLETE_STAGE1,
        email: "flow-gate@example.com",
        submissionToken: "sub-flow-gate-token",
      },
    });
    await installTurnstileStub(page);

    await page.goto(`/readiness?token=${STAGE3_TOKEN}`);
    await expect(page.getByTestId("readiness-score-gate")).toBeVisible();
  });
});
