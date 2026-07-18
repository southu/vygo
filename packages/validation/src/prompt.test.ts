/**
 * Unit tests for the diagnostic prompt builder — submission token embedding and
 * the appended submit-back instruction block (regression: analysis instructions
 * must stay byte-identical when a token is added around them).
 * Run: pnpm exec tsx --test packages/validation/src/prompt.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { READINESS_SUBMIT_URL, buildDiagnosticPrompt } from "./prompt.js";
import { READINESS_REPORT_V1_END, READINESS_REPORT_V1_START } from "./report-schema.js";
import type { ReadinessStage1Answers } from "./readiness-intake.js";

const ANSWERS: ReadinessStage1Answers = {
  productDescription: "B2B invoicing SaaS",
  whoUses: "External users paying",
  builtWith: "Claude Code",
  blockers: ["security questionnaire or review blocking a deal"],
  deadline: "No hard deadline",
  deadlineDetail: "",
};

const TOKEN = "4f8b2c1d-9e7a-4b6c-8d5e-1f2a3b4c5d6e";

function assertSubsequence(haystack: string[], needle: string[]): void {
  let i = 0;
  for (const line of haystack) {
    if (i < needle.length && line === needle[i]) i += 1;
  }
  assert.equal(i, needle.length, "original prompt lines must appear unchanged and in order");
}

describe("buildDiagnosticPrompt", () => {
  it("returns null when builtWith is empty", () => {
    assert.equal(buildDiagnosticPrompt({ answers: { ...ANSWERS, builtWith: "" } }), null);
  });

  it("omits the submission token and submit block when no token is provided", () => {
    const bundle = buildDiagnosticPrompt({ answers: ANSWERS });
    assert.ok(bundle);
    assert.ok(!bundle.prompt.includes(READINESS_SUBMIT_URL));
    assert.ok(!bundle.prompt.includes("SUBMISSION TOKEN"));
  });

  it("embeds the per-session submission token in the prompt", () => {
    const bundle = buildDiagnosticPrompt({ answers: ANSWERS, submissionToken: TOKEN });
    assert.ok(bundle);
    assert.ok(
      bundle.prompt.includes(`SUBMISSION TOKEN (unique to this readiness session): ${TOKEN}`),
    );
  });

  it("makes a browser-UA curl POST the default submission method", () => {
    const { prompt } = buildDiagnosticPrompt({ answers: ANSWERS, submissionToken: TOKEN })!;
    assert.ok(prompt.includes(`curl -X POST ${READINESS_SUBMIT_URL}`));
    // Standard browser User-Agent header (edge/WAF rejects bare curl/* agents).
    assert.ok(prompt.includes("-H 'User-Agent: Mozilla/5.0"));
    assert.ok(prompt.includes("-H 'Content-Type: application/json'"));
    // Payload carries the token, structured results JSON, and raw results_text.
    assert.ok(prompt.includes('"submission_token"'));
    assert.ok(prompt.includes('"results"'));
    assert.ok(prompt.includes('"results_text"'));
    assert.ok(prompt.includes("DEFAULT METHOD"));
  });

  it("uses a placeholder token in the curl example and never the real token", () => {
    const { prompt } = buildDiagnosticPrompt({ answers: ANSWERS, submissionToken: TOKEN })!;
    // The curl command shape carries the placeholder, not the real token value.
    assert.ok(prompt.includes('"submission_token": "YOUR_SUBMISSION_TOKEN"'));
    assert.ok(!prompt.includes(`"submission_token": "${TOKEN}"`));
    // Real token is delivered separately, on the labeled SUBMISSION TOKEN line only.
    assert.ok(prompt.includes(`SUBMISSION TOKEN (unique to this readiness session): ${TOKEN}`));
  });

  it("scopes submission to AIs with web/tool access and requires user confirmation", () => {
    const { prompt } = buildDiagnosticPrompt({ answers: ANSWERS, submissionToken: TOKEN })!;
    assert.ok(prompt.includes("IF you have web/tool access"));
    assert.ok(prompt.includes("do NOT have web/tool access"));
    assert.ok(prompt.includes("confirm to the user"));
  });

  it("tells AIs without web access to output a delimited block the customer can paste back", () => {
    const { prompt } = buildDiagnosticPrompt({ answers: ANSWERS, submissionToken: TOKEN })!;
    assert.ok(prompt.includes("do NOT have web/tool access"));
    assert.ok(prompt.includes("no web access"));
    assert.ok(prompt.includes("clearly delimited block"));
    assert.ok(prompt.includes("explicit begin and end markers"));
    assert.ok(
      prompt.includes(
        `Begin marker — the first line of the block, exactly: ${READINESS_REPORT_V1_START}`,
      ),
    );
    assert.ok(
      prompt.includes(
        `End marker — the last line of the block, exactly: ${READINESS_REPORT_V1_END}`,
      ),
    );
    assert.ok(prompt.includes("paste it into the paste box"));
    assert.ok(prompt.includes("couldn't send it"));
  });

  it("keeps the original analysis instructions unchanged around the additions", () => {
    const base = buildDiagnosticPrompt({ answers: ANSWERS })!;
    const withToken = buildDiagnosticPrompt({ answers: ANSWERS, submissionToken: TOKEN })!;
    assertSubsequence(withToken.prompt.split("\n"), base.prompt.split("\n"));
  });

  it("ignores a blank submission token", () => {
    const { prompt } = buildDiagnosticPrompt({ answers: ANSWERS, submissionToken: "   " })!;
    assert.ok(!prompt.includes(READINESS_SUBMIT_URL));
  });
});
