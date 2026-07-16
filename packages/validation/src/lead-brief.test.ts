import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildLeadBrief, buildTalkingPoints, tryLlmPolishBrief } from "./lead-brief.js";

describe("lead brief (template-first)", () => {
  it("builds a full brief with five-dimension summary, bucket, flags, and 3 talking points", () => {
    const brief = buildLeadBrief({
      submissionId: "00000000-0000-4000-8000-000000000099",
      contact: {
        name: "Ada Lovelace",
        email: "ada@example.com",
        company: "Analytical Engines",
        source: "readiness_score_gate",
      },
      bucket: "Harden",
      scores: {
        dimensions: {
          Security: 42,
          Reliability: 55,
          Operability: 60,
          Maintainability: 70,
          "Compliance posture": 40,
        },
        overall: 52,
        bucket: "Harden",
        reasoning: "Security and compliance need work before launch.",
        findings: ["Weak auth story", "Limited automated tests"],
        recommendedEngagement: "Harden",
        offerKey: "harden",
      },
      discrepancyFlags: [{ type: "auth_mismatch", field: "auth" }],
      parsedReport: {
        summary: "B2B analytics prototype",
        auth: "shared password",
        tests: "none",
        deploys: "manual",
      },
      stage1: {
        productDescription: "Analytics for mid-market ops teams",
        builtWith: "Cursor",
        blockers: ["security questionnaire or review blocking a deal"],
        deadline: "Yes within 30 days",
        deadlineDetail: "Enterprise pilot",
      },
      followupAnswers: {
        budget: "25k_75k",
      },
    });

    assert.equal(brief.version, 1);
    assert.equal(brief.company, "Analytical Engines");
    assert.equal(brief.contact.email, "ada@example.com");
    assert.equal(brief.source, "readiness_score_gate");
    assert.equal(brief.productOneLiner, "Analytics for mid-market ops teams");
    assert.equal(brief.buildTool, "Cursor");
    assert.deepEqual(brief.blockers, ["security questionnaire or review blocking a deal"]);
    assert.equal(brief.deadline, "Yes within 30 days");
    assert.equal(brief.bucket, "Harden");
    assert.equal(brief.scoreSummary.dimensions.Security, 42);
    assert.equal(brief.scoreSummary.dimensions["Compliance posture"], 40);
    assert.ok(brief.reasoning?.includes("Security"));
    assert.equal(brief.budget, "25k_75k");
    assert.equal(brief.discrepancyFlags.length, 1);
    assert.equal(brief.talkingPoints.length, 3);
    assert.equal(brief.llmPolished, false);
    assert.ok(brief.parsedTechReport?.auth);
    assert.ok(!JSON.stringify(brief).includes("sk_live"));
  });

  it("still builds when optional fields are missing (no LLM required)", () => {
    const brief = buildLeadBrief({
      submissionId: "sub-1",
      scores: { dimensions: { Security: 30 }, bucket: "Launch" },
      bucket: "Launch",
    });
    assert.equal(brief.bucket, "Launch");
    assert.equal(brief.talkingPoints.length, 3);
    assert.equal(brief.llmPolished, false);
    assert.equal(brief.productOneLiner, null);
    assert.deepEqual(brief.blockers, []);
  });

  it("tryLlmPolishBrief fails closed without a key", async () => {
    const brief = buildLeadBrief({
      submissionId: "sub-2",
      bucket: "Scale",
      scores: { bucket: "Scale", dimensions: { Reliability: 80 } },
    });
    const polished = await tryLlmPolishBrief(brief, {});
    assert.equal(polished, null);
  });

  it("buildTalkingPoints always returns three strings", () => {
    const pts = buildTalkingPoints({
      productOneLiner: null,
      buildTool: null,
      blockers: [],
      deadline: null,
      scoreSummary: {
        dimensions: {},
        overall: null,
        bucket: null,
        reasoning: null,
        findings: [],
        recommendedEngagement: null,
      },
      budget: null,
      discrepancyFlags: [],
    });
    assert.equal(pts.length, 3);
    for (const p of pts) assert.ok(p.length > 10);
  });
});
