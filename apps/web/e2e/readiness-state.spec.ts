import { test, expect, type Page, type Route } from "@playwright/test";
import { installTurnstileStub } from "./helpers";

/**
 * State-transition coverage for the authoritative readiness progression model
 * (packages/validation readiness-state.ts, surfaced by ReadinessFlow.tsx). The
 * live flow exposes its current authoritative state on
 * `document.documentElement.dataset.readinessState`; these tests drive the real
 * client state machine (all backend calls mocked) and assert the ordered stages,
 * the report_pasted → report_parsed gate, the explicit findings-confirmation
 * gate, the ?new=1 / resume URL behaviour, and — critically — that the
 * background mission-completion callback never advances into report_parsed or
 * findings_confirmed.
 *
 * The canonical stages are:
 *   intake → prompt_displayed → user_ready_to_paste → report_pasted
 *          → report_parsed → findings_confirmed
 */

const SESSION_TOKEN = "state-session-token-0000000000000000";
const SUBMISSION_TOKEN = "state-submission-token-1111111111";

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

type SessionStore = { token: string; stage: string; draft: Record<string, unknown> };

/**
 * Install the mocked readiness backend. `parse` and `status` are mutable so a
 * test can force a delayed parse (to observe report_pasted), a parse failure, or
 * a background "ready" ingest landing.
 */
async function installRoutes(
  page: Page,
  init: { stage?: string; draft?: Record<string, unknown>; token?: string } = {},
) {
  const store: SessionStore = {
    token: init.token ?? SESSION_TOKEN,
    stage: init.stage ?? "intake",
    draft: init.draft ?? {},
  };
  const parse = {
    status: 200,
    delayMs: 0,
    body: {
      parseStatus: "ok",
      stack: "TypeScript, Next.js",
      size: "Small",
      findings: ["Auth hardening needed", "Add rate limiting"],
    } as Record<string, unknown>,
  };
  // Ingest status: default "pending" (awaiting the AI). A test can flip it to a
  // landed "ready" record to exercise the background mission-completion path.
  const statusState = { body: { status: "pending" } as Record<string, unknown> };

  await page.route("**/v1/readiness/session", async (route: Route) => {
    if (route.request().method() !== "POST") return route.continue();
    const body = (route.request().postDataJSON() ?? {}) as {
      stage?: string;
      draft?: Record<string, unknown>;
    };
    store.stage = body.stage ?? "intake";
    store.draft = body.draft ?? {};
    await route.fulfill(json({ token: store.token, stage: store.stage, draft: store.draft }));
  });

  await page.route("**/v1/readiness/session/*", async (route: Route) => {
    if (route.request().method() === "PATCH") {
      const body = (route.request().postDataJSON() ?? {}) as {
        stage?: string;
        draft?: Record<string, unknown>;
      };
      if (typeof body.stage === "string") store.stage = body.stage;
      if (body.draft && typeof body.draft === "object") store.draft = body.draft;
    }
    await route.fulfill(json({ token: store.token, stage: store.stage, draft: store.draft }));
  });

  await page.route("**/api/readiness/token", async (route: Route) => {
    await route.fulfill(json({ token: SUBMISSION_TOKEN }));
  });
  await page.route("**/api/readiness/start", async (route: Route) => {
    await route.fulfill(json({ ok: true, run_id: "run-state-1" }));
  });
  await page.route("**/api/readiness/status**", async (route: Route) => {
    await route.fulfill(json(statusState.body));
  });
  await page.route("**/api/readiness/submit", async (route: Route) => {
    await route.fulfill(json({ message: "received" }));
  });
  await page.route("**/v1/readiness/parse", async (route: Route) => {
    if (parse.delayMs > 0) await new Promise((r) => setTimeout(r, parse.delayMs));
    await route.fulfill(json(parse.body, parse.status));
  });

  return {
    store,
    delayParse(ms: number) {
      parse.delayMs = ms;
    },
    setParseFailure() {
      parse.status = 200;
      parse.body = { parseStatus: "manual", stack: "", size: "", findings: [] };
    },
    landBackgroundResults(resultsText: string) {
      statusState.body = {
        status: "ready",
        resultsText,
        receivedAt: "2026-07-29T00:00:00.000Z",
      };
    },
    /**
     * Land a real AI ingest submission on the status poll using the SERVER
     * contract field names (snake_case): status `received`, with `results_text`,
     * `received_at`, and the echoed `submission_token`. This is what the poll
     * client (lib/readiness/api.ts) actually reads to advance the waiting screen.
     */
    landSubmission(
      submissionToken: string,
      resultsText = "VYGO-READINESS-REPORT: auth hardening needed; add rate limiting.",
    ) {
      statusState.body = {
        status: "received",
        results_text: resultsText,
        received_at: "2026-07-29T00:00:00.000Z",
        submission_token: submissionToken,
      };
    },
  };
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

/** The run/analysis identifier the current run persisted to localStorage. */
function readStoredRunId(page: Page) {
  return page.evaluate(() => {
    try {
      const raw = window.localStorage.getItem("vygo:readiness:v1");
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { runId?: string | null };
      return parsed.runId ?? null;
    } catch {
      return null;
    }
  });
}

/** The prior-run fields that a ?new=1 start must have wiped from localStorage. */
function readStoredRunData(page: Page) {
  return page.evaluate(() => {
    try {
      const raw = window.localStorage.getItem("vygo:readiness:v1");
      if (!raw) return null;
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  });
}

/** A persisted Step-8 / completed readiness run (findings confirmed, gate stage). */
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

test.describe("readiness state model — ordered progression exposed live", () => {
  test("a fresh ?new=1 flow walks every stage in order with none skipped", async ({ page }) => {
    const routes = await installRoutes(page);
    await installTurnstileStub(page);
    // Delay the parse so report_pasted is observable before report_parsed.
    routes.delayParse(1500);

    await page.goto("/readiness?new=1");

    // intake: project step, then Stage 1.
    await expect(page.getByTestId("readiness-project")).toBeVisible();
    await expect.poll(() => readState(page)).toBe("intake");
    await startProjectRun(page, "State Machine Project");
    await expect.poll(() => readState(page)).toBe("intake");

    // prompt_displayed.
    await completeIntake(page);
    await expect(page.getByTestId("readiness-stage2")).toBeVisible();
    await expect.poll(() => readState(page)).toBe("prompt_displayed");
    await expect(page.getByTestId("readiness-stage2")).toHaveAttribute(
      "data-readiness-state",
      "prompt_displayed",
    );

    // user_ready_to_paste.
    await page.getByTestId("readiness-go-paste").click();
    await expect.poll(() => readState(page)).toBe("user_ready_to_paste");

    // report_pasted — submitting the report, while the (delayed) parse is in flight.
    const stage3 = page.locator('div.readiness-assessment[data-testid="readiness-stage3"]');
    await stage3
      .getByTestId("readiness-paste-textarea")
      .fill("VYGO-READINESS-REPORT: auth needs hardening; add rate limiting.");
    await stage3.getByTestId("readiness-paste-submit").click();
    await expect.poll(() => readState(page)).toBe("report_pasted");

    // report_parsed — only after the successful parse response resolves.
    await expect.poll(() => readState(page), { timeout: 10_000 }).toBe("report_parsed");
    await expect(page.getByTestId("readiness-confirm")).toBeVisible();

    // findings_confirmed — only via the explicit confirmation control.
    await page.getByTestId("readiness-confirm-looks-right").click();
    await expect(page.getByTestId("readiness-score-gate")).toBeVisible();
    await expect.poll(() => readState(page)).toBe("findings_confirmed");
  });

  test("a failed parse stays at report_pasted and never exposes findings confirmed as complete", async ({
    page,
  }) => {
    const routes = await installRoutes(page);
    await installTurnstileStub(page);
    routes.setParseFailure();

    await page.goto("/readiness?new=1");
    await startProjectRun(page, "Failed Parse Project");
    await completeIntake(page);
    await page.getByTestId("readiness-go-paste").click();

    const stage3 = page.locator('div.readiness-assessment[data-testid="readiness-stage3"]');
    await stage3
      .getByTestId("readiness-paste-textarea")
      .fill("not a structured report, just some free prose that cannot parse");
    await stage3.getByTestId("readiness-paste-submit").click();

    // The parse-failure message shows and the state holds at report_pasted —
    // it must never advance to report_parsed on a failed parse.
    await expect(page.getByTestId("readiness-parse-failed")).toBeVisible();
    await expect.poll(() => readState(page)).toBe("report_pasted");
    // Findings confirmation is not auto-reached (no gate yet).
    await expect(page.getByTestId("readiness-score-gate")).toHaveCount(0);

    // The explicit findings-confirmation control ("Looks right → continue") must
    // NOT be exposed on a failed parse — there is no report_pasted →
    // findings_confirmed edge. Only a re-paste control is offered.
    await expect(page.getByTestId("readiness-confirm-looks-right")).toHaveCount(0);
    await expect(page.getByTestId("readiness-confirm-repaste")).toBeVisible();

    // Activating the only forward control re-paste returns to user_ready_to_paste,
    // and still never reaches findings confirmation.
    await page.getByTestId("readiness-confirm-repaste").click();
    await expect.poll(() => readState(page)).toBe("user_ready_to_paste");
    await expect(page.getByTestId("readiness-score-gate")).toHaveCount(0);
  });

  test("a report parsed as all-UNKNOWN (rejected) holds at report_pasted and offers only re-paste", async ({
    page,
  }) => {
    const routes = await installRoutes(page);
    await installTurnstileStub(page);
    // The parser rejects an all-UNKNOWN report: no readable structured result.
    routes.setParseFailure();

    await page.goto("/readiness?new=1");
    await startProjectRun(page, "All Unknown Project");
    await completeIntake(page);
    await page.getByTestId("readiness-go-paste").click();

    const stage3 = page.locator('div.readiness-assessment[data-testid="readiness-stage3"]');
    await stage3
      .getByTestId("readiness-paste-textarea")
      .fill(
        [
          "=== begin VYGO-READINESS-REPORT ===",
          "STACK: UNKNOWN",
          "SIZE: UNKNOWN",
          "FINDINGS: UNKNOWN",
          "=== end VYGO-READINESS-REPORT ===",
        ].join("\n"),
      );
    await stage3.getByTestId("readiness-paste-submit").click();

    await expect(page.getByTestId("readiness-parse-failed")).toBeVisible();
    // Never report_parsed, never findings confirmed.
    await expect.poll(() => readState(page)).toBe("report_pasted");
    await expect(page.getByTestId("readiness-confirm-looks-right")).toHaveCount(0);
    await expect(page.getByTestId("readiness-score-gate")).toHaveCount(0);
  });
});

test.describe("readiness state model — background mission-completion callback", () => {
  test("a background 'ready' landing at prompt_displayed does NOT enter report_parsed or findings_confirmed", async ({
    page,
  }) => {
    const routes = await installRoutes(page);
    await installTurnstileStub(page);

    await page.goto("/readiness?new=1");
    await startProjectRun(page, "Background Completion Project");
    await completeIntake(page);
    await expect(page.getByTestId("readiness-stage2")).toBeVisible();
    await expect.poll(() => readState(page)).toBe("prompt_displayed");

    // Fire the background mission-completion path with a bare completion body.
    // The poll picks it up as an asynchronous mission callback.
    routes.landBackgroundResults("Analysis completed.");

    // The callback surfaces ONLY a "results are ready" notice — it must NOT
    // advance the readiness state, complete the paste stage, or reach Confirm.
    await expect(page.getByTestId("readiness-background-results")).toBeVisible();
    // Give the poll ample time; the state must remain prompt_displayed.
    await page.waitForTimeout(1500);
    expect(await readState(page)).toBe("prompt_displayed");
    await expect(page.getByTestId("readiness-confirm")).toHaveCount(0);
    await expect(page.getByTestId("readiness-score-gate")).toHaveCount(0);

    // Reviewing is user-driven: the notice's control moves to the paste step
    // (user_ready_to_paste) — and the completion text was NEVER copied into the
    // pasted-report field, so the paste box is still empty and no findings exist.
    await page.getByTestId("readiness-background-results-review").click();
    await expect.poll(() => readState(page)).toBe("user_ready_to_paste");
    const stage3 = page.locator('div.readiness-assessment[data-testid="readiness-stage3"]');
    await expect(stage3.getByTestId("readiness-paste-textarea")).toHaveValue("");
    await expect(page.getByTestId("readiness-confirm")).toHaveCount(0);
  });
});

test.describe("readiness state model — resume vs. fresh URL", () => {
  test("reloading without ?new=1 hydrates to the persisted legal stage", async ({ page }) => {
    // A resumable session persisted at the paste stage.
    await installRoutes(page, {
      token: SESSION_TOKEN,
      stage: "paste",
      draft: { stage1: COMPLETE_STAGE1, project: "Resume Project", pasteText: "" },
    });
    await installTurnstileStub(page);

    await page.goto(`/readiness?token=${SESSION_TOKEN}`);
    // Hydrates straight to user_ready_to_paste (the persisted paste stage).
    await expect.poll(() => readState(page)).toBe("user_ready_to_paste");
  });

  test("an explicitly confirmed flow stays at findings_confirmed across a plain reload", async ({
    page,
  }) => {
    // The exact mission scenario: run a fresh flow, submit a valid report, click
    // "Looks right → continue" to reach the results gate (findings_confirmed),
    // then reload /readiness WITHOUT ?new=1. The confirmed results gate must be
    // restored — the flow must NOT drop back to the confirm step.
    const routes = await installRoutes(page);
    await installTurnstileStub(page);

    await page.goto("/readiness?new=1");
    await startProjectRun(page, "Confirmed Persist Project");
    await completeIntake(page);
    await page.getByTestId("readiness-go-paste").click();

    const stage3 = page.locator('div.readiness-assessment[data-testid="readiness-stage3"]');
    await stage3
      .getByTestId("readiness-paste-textarea")
      .fill("VYGO-READINESS-REPORT: auth needs hardening; add rate limiting.");
    await stage3.getByTestId("readiness-paste-submit").click();
    await expect.poll(() => readState(page)).toBe("report_parsed");

    // Explicit confirmation → the results gate.
    await page.getByTestId("readiness-confirm-looks-right").click();
    await expect(page.getByTestId("readiness-score-gate")).toBeVisible();
    await expect.poll(() => readState(page)).toBe("findings_confirmed");
    // The confirmed stage was persisted as "gate" (findings_confirmed).
    expect(routes.store.stage).toBe("gate");

    // Wait a beat (mirrors the reported 3s window), then reload plainly.
    await page.waitForTimeout(500);
    await page.goto("/readiness");

    // Restored to the results gate — findings_confirmed — not the confirm step.
    await expect(page.getByTestId("readiness-score-gate")).toBeVisible();
    await expect.poll(() => readState(page)).toBe("findings_confirmed");
    await expect(page.getByTestId("readiness-confirm")).toHaveCount(0);

    // ?new=1 still starts a fresh project flow rather than resuming the gate.
    await page.goto("/readiness?new=1");
    await expect(page.getByTestId("readiness-project")).toBeVisible();
    await expect.poll(() => readState(page)).toBe("intake");
  });

  test("?new=1 after persisted Step 8 state shows a clean prompt stage with a fresh run id", async ({
    page,
  }) => {
    // Seed a persisted, COMPLETED (Step 8 / gate) readiness run in localStorage.
    await page.addInitScript(
      ({ key, state }) => window.localStorage.setItem(key, JSON.stringify(state)),
      { key: "vygo:readiness:v1", state: PRIOR_STEP8_STATE },
    );
    await installRoutes(page);
    await installTurnstileStub(page);

    await page.goto("/readiness?new=1");

    // A clean prompt-stage session: the project start step, not the prior gate.
    await expect(page.getByTestId("readiness-project")).toBeVisible();
    await expect.poll(() => readState(page)).toBe("intake");
    // No restored confirm/score-gate/paste from the prior completed run.
    await expect(page.getByTestId("readiness-confirm")).toHaveCount(0);
    await expect(page.getByTestId("readiness-score-gate")).toHaveCount(0);

    // A fresh analysis/run identifier, different from the prior run's.
    await expect.poll(() => readStoredRunId(page)).not.toBeNull();
    const newRunId = await readStoredRunId(page);
    expect(newRunId).not.toBe(PRIOR_STEP8_STATE.runId);
    expect(await page.evaluate(() => document.documentElement.dataset.readinessRunId ?? null)).toBe(
      newRunId,
    );

    // Every prior-run field was wiped from the persisted state — nothing from the
    // completed run can repopulate the new one during or after hydration.
    const stored = await readStoredRunData(page);
    expect(stored?.stage).toBe("intake");
    expect(stored?.pasteText ?? "").toBe("");
    expect(stored?.findings ?? null).toBeFalsy();
    expect(stored?.parseStatus ?? null).toBeFalsy();
    expect(stored?.confirmedAt ?? null).toBeFalsy();
    expect(stored?.completed ?? null).toBeFalsy();
  });

  test("two consecutive ?new=1 starts create different run ids and each renders a clean prompt stage", async ({
    page,
  }) => {
    // Start from a prior completed run so the first ?new=1 also proves isolation.
    await page.addInitScript(
      ({ key, state }) => window.localStorage.setItem(key, JSON.stringify(state)),
      { key: "vygo:readiness:v1", state: PRIOR_STEP8_STATE },
    );
    await installRoutes(page);
    await installTurnstileStub(page);

    // First new=1.
    await page.goto("/readiness?new=1");
    await expect(page.getByTestId("readiness-project")).toBeVisible();
    await expect.poll(() => readState(page)).toBe("intake");
    await expect.poll(() => readStoredRunId(page)).not.toBeNull();
    const firstRunId = await readStoredRunId(page);
    expect(firstRunId).not.toBe(PRIOR_STEP8_STATE.runId);

    // Second new=1 in the SAME browser session (localStorage persists across the
    // reload). It must mint a different run id and again show a clean prompt stage.
    await page.goto("/readiness?new=1");
    await expect(page.getByTestId("readiness-project")).toBeVisible();
    await expect.poll(() => readState(page)).toBe("intake");
    await expect.poll(() => readStoredRunId(page)).not.toBe(firstRunId);
    const secondRunId = await readStoredRunId(page);
    expect(secondRunId).not.toBeNull();
    expect(secondRunId).not.toBe(firstRunId);

    // Clean each time: no restored confirm/gate/paste.
    await expect(page.getByTestId("readiness-confirm")).toHaveCount(0);
    await expect(page.getByTestId("readiness-score-gate")).toHaveCount(0);
    const stored = await readStoredRunData(page);
    expect(stored?.stage).toBe("intake");
    expect(stored?.pasteText ?? "").toBe("");
    expect(stored?.findings ?? null).toBeFalsy();
  });

  test("ordinary resume (no ?new=1) keeps the persisted run id and stage", async ({ page }) => {
    // A valid incomplete resumable state persisted at the paste stage with a run id.
    await installRoutes(page, {
      token: SESSION_TOKEN,
      stage: "paste",
      draft: { stage1: COMPLETE_STAGE1, project: "Resume Project", pasteText: "" },
    });
    await page.addInitScript(
      ({ key, state }) => window.localStorage.setItem(key, JSON.stringify(state)),
      {
        key: "vygo:readiness:v1",
        state: {
          token: SESSION_TOKEN,
          stage: "paste",
          stage1: COMPLETE_STAGE1,
          projectLabel: "Resume Project",
          runId: "run_resume_keep",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    );
    await installTurnstileStub(page);

    await page.goto("/readiness");
    // Restores the persisted stage AND keeps its existing run identifier.
    await expect.poll(() => readState(page)).toBe("user_ready_to_paste");
    await expect.poll(() => readStoredRunId(page)).toBe("run_resume_keep");
    expect(await page.evaluate(() => document.documentElement.dataset.readinessRunId ?? null)).toBe(
      "run_resume_keep",
    );
  });

  test("a resumed prompt-stage session whose draft carries only a submission token shows the waiting screen, polls, and auto-advances with the confirmation when results land", async ({
    page,
  }) => {
    // Reported regression: an AI-driven stage-2 session — persisted at the prompt
    // stage with a live submission token in its draft but WITHOUT the full stage-1
    // answers (the client never walked the intake questions) — resumed via
    // ?token= but never rendered readiness-waiting, so the tab could never poll or
    // advance when the customer's AI POSTed results back.
    const RESUMED_SUBMISSION_TOKEN = "resumed-ai-submission-token-abcd1234efgh5678";
    const routes = await installRoutes(page, {
      token: SESSION_TOKEN,
      stage: "prompt",
      draft: { submissionToken: RESUMED_SUBMISSION_TOKEN },
    });
    await installTurnstileStub(page);

    await page.goto(`/readiness?token=${SESSION_TOKEN}`);

    // The waiting/polling screen renders even though the draft has no stage-1
    // answers (previously this fell through to the intake / generation-error view).
    await expect(page.getByTestId("readiness-stage2")).toBeVisible();
    await expect(page.getByTestId("readiness-waiting")).toBeVisible();
    await expect(page.getByTestId("readiness-waiting-status")).toBeVisible();
    await expect(page.getByTestId("readiness-stage2-generation-error")).toHaveCount(0);

    // The customer's AI POSTs results back → the status poll flips to `received`.
    routes.landSubmission(RESUMED_SUBMISSION_TOKEN);

    // Within one poll interval the waiting screen auto-advances to the paste step
    // and shows the server-recorded confirmation: the received_at timestamp and
    // the last 8 characters of the submitted token.
    await expect(page.getByTestId("readiness-submission-confirmation")).toBeVisible();
    await expect(page.getByTestId("readiness-submission-timestamp")).toContainText("2026-07-29");
    await expect(page.getByTestId("readiness-submission-token-last8")).toHaveText(
      RESUMED_SUBMISSION_TOKEN.slice(-8),
    );
  });

  test("?new=1 does not hydrate a prior resumable session into a later stage", async ({ page }) => {
    // Seed a prior completed analysis (prompt stage) in localStorage.
    await page.addInitScript(
      ({ key, state }) => window.localStorage.setItem(key, JSON.stringify(state)),
      {
        key: "vygo:readiness:v1",
        state: {
          token: "prior-token-9999999999999999",
          stage: "prompt",
          stage1: COMPLETE_STAGE1,
          pasteText: "prior paste",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    );
    await installRoutes(page);
    await installTurnstileStub(page);

    await page.goto("/readiness?new=1");
    // Fresh flow starts at intake, never the prior prompt_displayed stage.
    await expect(page.getByTestId("readiness-project")).toBeVisible();
    await expect.poll(() => readState(page)).toBe("intake");
  });
});
