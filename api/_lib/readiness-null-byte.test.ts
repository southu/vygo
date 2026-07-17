/**
 * Edge draft ingest must strip U+0000 so free-text never 500s on Postgres jsonb.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { redactEdgeDraft } from "./readiness.js";

describe("redactEdgeDraft — null-byte free-text", () => {
  it("strips U+0000 from nested free-text fields", () => {
    const out = redactEdgeDraft({
      productDescription: "Inventory\u0000SaaS for retail",
      manualAnswers: {
        summary: "A\u0000B",
        concerns: "fragility\u0000here",
      },
      report: { summary: "report\u0000sum" },
      // Non-NUL C0 and emoji must survive.
      note: "keep\u0001\u0002\u0007",
      emoji: "🚀🔒",
    });
    assert.equal(out.productDescription, "InventorySaaS for retail");
    assert.equal((out.manualAnswers as Record<string, string>).summary, "AB");
    assert.equal((out.manualAnswers as Record<string, string>).concerns, "fragilityhere");
    assert.equal((out.report as Record<string, string>).summary, "reportsum");
    assert.equal(out.note, "keep\u0001\u0002\u0007");
    assert.equal(out.emoji, "🚀🔒");
    assert.equal(JSON.stringify(out).includes("\u0000"), false);
  });
});
