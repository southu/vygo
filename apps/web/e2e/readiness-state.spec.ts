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
    await stage3.getByTestId("readiness-paste-textarea").fill(
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

    // Fire the background mission-completion path: the ingest status now reports a
    // landed report. The poll picks it up.
    routes.landBackgroundResults(
      "VYGO-READINESS-REPORT: findings from the customer's AI posting back.",
    );

    // The background callback records results as metadata (a notice appears +
    // the paste box is prefilled) but must NOT advance the readiness state.
    await expect(page.getByTestId("readiness-background-results")).toBeVisible();
    // Give the poll ample time; the state must remain prompt_displayed.
    await page.waitForTimeout(1500);
    expect(await readState(page)).toBe("prompt_displayed");
    await expect(page.getByTestId("readiness-confirm")).toHaveCount(0);
    await expect(page.getByTestId("readiness-score-gate")).toHaveCount(0);

    // Reviewing is user-driven: the notice's control moves to the paste step
    // (user_ready_to_paste) with the received results prefilled — still no
    // automatic parse/confirm.
    await page.getByTestId("readiness-background-results-review").click();
    await expect.poll(() => readState(page)).toBe("user_ready_to_paste");
    const stage3 = page.locator('div.readiness-assessment[data-testid="readiness-stage3"]');
    await expect(stage3.getByTestId("readiness-paste-textarea")).not.toHaveValue("");
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
