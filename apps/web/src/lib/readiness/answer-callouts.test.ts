/**
 * Unit tests for mid-flow answer callouts.
 * Callouts must echo real inputs, never claim scores/analysis, and cover
 * tools/platforms + security dimension cases used by acceptance tests.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calloutForBlockers,
  calloutForBuiltWith,
  calloutForDeadline,
  calloutForFreeText,
  calloutForManualField,
  calloutForProductDescription,
  calloutForWhoUses,
  parseListedItems,
} from "./answer-callouts";

const FORBIDDEN_SCORE_CLAIMS =
  /your score is|analysis complete|scoring complete|results are ready|you scored|final score/i;

describe("parseListedItems", () => {
  it("extracts known platforms from a comma list", () => {
    const items = parseListedItems("HubSpot, Salesforce, Slack");
    assert.deepEqual(items, ["HubSpot", "Salesforce", "Slack"]);
  });

  it("returns empty for a single long sentence (not a list)", () => {
    const items = parseListedItems("A scheduling product for multi-location clinics");
    assert.equal(items.length, 0);
  });
});

describe("calloutForProductDescription", () => {
  it("echoes platform count and names for tools list", () => {
    const c = calloutForProductDescription("HubSpot, Salesforce, Slack");
    assert.ok(c);
    assert.equal(c!.id, "product-tools");
    assert.match(c!.text, /3 platforms?/);
    assert.match(c!.text, /HubSpot/);
    assert.match(c!.text, /Salesforce/);
    assert.match(c!.text, /Slack/);
    assert.doesNotMatch(c!.text, FORBIDDEN_SCORE_CLAIMS);
  });

  it("echoes free text when no tool list is present", () => {
    const c = calloutForProductDescription("Clinic scheduling MVP");
    assert.ok(c);
    assert.match(c!.text, /Clinic scheduling MVP/);
    assert.doesNotMatch(c!.text, FORBIDDEN_SCORE_CLAIMS);
  });

  it("returns null for empty input", () => {
    assert.equal(calloutForProductDescription("   "), null);
  });
});

describe("calloutForBlockers (security dimension)", () => {
  it("notes security dimension for security questionnaire blocker", () => {
    const answer = "security questionnaire or review blocking a deal";
    const c = calloutForBlockers([answer]);
    assert.ok(c);
    assert.equal(c!.id, "blockers-security");
    assert.match(c!.text, /security dimension/i);
    assert.match(c!.text, /security questionnaire/i);
    assert.doesNotMatch(c!.text, FORBIDDEN_SCORE_CLAIMS);
  });

  it("notes security dimension for IT approval blocker", () => {
    const answer = "customer IT won't approve rollout";
    const c = calloutForBlockers([answer]);
    assert.ok(c);
    assert.equal(c!.id, "blockers-security");
    assert.match(c!.text, /security dimension/i);
    assert.match(c!.text, /IT won't approve/i);
  });

  it("echoes non-security blockers without claiming scores", () => {
    const answer = "broke or struggles with real usage";
    const c = calloutForBlockers([answer]);
    assert.ok(c);
    assert.equal(c!.id, "blockers");
    assert.match(c!.text, /broke or struggles/);
    assert.doesNotMatch(c!.text, /security dimension/i);
    assert.doesNotMatch(c!.text, FORBIDDEN_SCORE_CLAIMS);
  });
});

describe("other stage-1 callouts", () => {
  it("echoes who-uses selection", () => {
    const c = calloutForWhoUses("External users paying");
    assert.ok(c);
    assert.match(c!.text, /External users paying/);
    assert.doesNotMatch(c!.text, FORBIDDEN_SCORE_CLAIMS);
  });

  it("echoes built-with tool", () => {
    const c = calloutForBuiltWith("Cursor");
    assert.ok(c);
    assert.match(c!.text, /Cursor/);
    assert.doesNotMatch(c!.text, FORBIDDEN_SCORE_CLAIMS);
  });

  it("echoes deadline", () => {
    const c = calloutForDeadline("Yes within 30 days");
    assert.ok(c);
    assert.match(c!.text, /Yes within 30 days/);
  });
});

describe("manual questionnaire callouts", () => {
  it("tools/platforms field echoes count and names", () => {
    const c = calloutForManualField("languages", "HubSpot, Salesforce, Slack");
    assert.ok(c);
    assert.match(c!.text, /3/);
    assert.match(c!.text, /HubSpot/);
    assert.match(c!.text, /Salesforce/);
    assert.match(c!.text, /Slack/);
  });

  it("auth field is treated as security-related even when a tool name appears", () => {
    const c = calloutForManualField("auth", "Auth0 with SSO");
    assert.ok(c);
    assert.equal(c!.id, "auth-security");
    assert.match(c!.text, /security dimension/i);
    assert.match(c!.text, /Auth0/);
    assert.match(c!.text, /SSO/i);
  });

  it("secrets_pattern field is treated as security-related", () => {
    const c = calloutForManualField("secrets_pattern", "host env vars / vault");
    assert.ok(c);
    assert.equal(c!.id, "secrets_pattern-security");
    assert.match(c!.text, /security dimension/i);
    assert.match(c!.text, /vault/i);
  });
});

describe("calloutForFreeText security cues", () => {
  it("flags free-text security keywords over false tool lists", () => {
    const c = calloutForFreeText("notes", "We need SOC 2 and SSO for enterprise");
    assert.ok(c);
    assert.match(c!.id, /security/);
    assert.match(c!.text, /security dimension/i);
    assert.match(c!.text, /SOC 2|SSO/i);
    assert.doesNotMatch(c!.text, FORBIDDEN_SCORE_CLAIMS);
  });
});
