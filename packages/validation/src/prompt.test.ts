/**
 * Unit tests for the diagnostic prompt builder — submission token embedding and
 * the appended submit-back instruction block (regression: analysis instructions
 * must stay byte-identical when a token is added around them).
 * Run: pnpm exec tsx --test packages/validation/src/prompt.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { READINESS_SUBMIT_URL, buildDiagnosticPrompt } from "./prompt.js";
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

  it("appends an explicit POST instruction block with the exact body shape", () => {
    const { prompt } = buildDiagnosticPrompt({ answers: ANSWERS, submissionToken: TOKEN })!;
    assert.ok(prompt.includes(READINESS_SUBMIT_URL));
    assert.ok(prompt.includes("Method: POST"));
    assert.ok(prompt.includes('"submission_token"'));
    assert.ok(prompt.includes(`"submission_token": "${TOKEN}"`));
    assert.ok(prompt.includes('"results"'));
    assert.ok(prompt.includes('"results_text"'));
  });

  it("scopes submission to AIs with web/tool access and requires user confirmation", () => {
    const { prompt } = buildDiagnosticPrompt({ answers: ANSWERS, submissionToken: TOKEN })!;
    assert.ok(prompt.includes("IF you have web/tool access"));
    assert.ok(prompt.includes("do NOT have web/tool access"));
    assert.ok(prompt.includes("confirm to the user"));
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
