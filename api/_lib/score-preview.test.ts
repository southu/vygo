/**
 * Edge-local score-preview dry-run (no Turnstile, no PII, pure compute).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runScorePreview, scoreBuiltInProfiles } from "./score-preview.js";

describe("runScorePreview", () => {
  it("fails closed when no answers or profile are provided", () => {
    const result = runScorePreview({});
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 400);
      assert.equal(result.code, "VALIDATION_ERROR");
    }
  });

  it("scores weak and strong profiles with full evidence and different dimension scores", () => {
    const weak = runScorePreview({ profile: "weak" });
    const strong = runScorePreview({ profile: "strong" });
    assert.equal(weak.ok, true);
    assert.equal(strong.ok, true);
    if (!weak.ok || !strong.ok) return;

    assert.equal(weak.body.preview, true);
    assert.equal(weak.body.dryRun, true);
    assert.equal(weak.body.persisted, false);
    assert.equal(weak.body.turnstileRequired, false);

    const weakDims = weak.body.dimensionResults as Array<{
      dimension: string;
      score: number;
      sub_metrics: Array<{
        name: string;
        score: number;
        weight: number;
        evidence: { question_id: string; answer_value: unknown; reason: string };
      }>;
    }>;
    const strongDims = strong.body.dimensionResults as typeof weakDims;

    assert.equal(weakDims.length, 5);
    assert.equal(strongDims.length, 5);

    let anyDiffers = false;
    for (let i = 0; i < weakDims.length; i += 1) {
      if (weakDims[i]!.score !== strongDims[i]!.score) anyDiffers = true;
    }
    assert.ok(anyDiffers);

    const weakScores = weakDims.map((d) => d.score);
    const strongScores = strongDims.map((d) => d.score);
    assert.ok(new Set(weakScores).size > 1);
    assert.ok(new Set(strongScores).size > 1);
    assert.ok(!(weakScores.every((s) => s === 25) && strongScores.every((s) => s === 25)));

    for (const dim of weakDims) {
      assert.ok(dim.sub_metrics.length >= 4 && dim.sub_metrics.length <= 6);
      for (const sm of dim.sub_metrics) {
        assert.ok(sm.name.length > 0);
        assert.equal(typeof sm.score, "number");
        assert.equal(typeof sm.weight, "number");
        assert.ok(sm.evidence.question_id.length > 0);
        assert.ok(sm.evidence.answer_value != null && sm.evidence.answer_value !== "");
        assert.ok(typeof sm.evidence.reason === "string" && sm.evidence.reason.length > 10);
        assert.notEqual(sm.evidence.reason, "N/A");
      }
    }

    const reasons = weakDims.flatMap((d) => d.sub_metrics.map((s) => s.evidence.reason));
    assert.ok(new Set(reasons).size > 3, "reasons must vary with answers");
  });

  it("accepts a custom answers map", () => {
    const result = runScorePreview({
      answers: {
        auth: "none — shared password only",
        tests: "none",
        secrets_pattern: "hardcoded in git",
        deploys: "manual ssh",
        logging: "console only",
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(Array.isArray(result.body.dimensionResults));
    assert.equal(typeof result.body.overall, "number");
  });

  it("scoreBuiltInProfiles returns both weak and strong payloads", () => {
    const both = scoreBuiltInProfiles();
    assert.equal(both.weak.profile, "weak");
    assert.equal(both.strong.profile, "strong");
    assert.ok(Array.isArray(both.weak.dimensionResults));
    assert.ok(Array.isArray(both.strong.dimensionResults));
    assert.notEqual(both.weak.overall, both.strong.overall);
  });
});
