import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isValidReadinessToken, proxyToken, proxySubmit } from "./readiness.js";

describe("edge readiness token validation", () => {
  it("validates high-entropy token formats", () => {
    assert.equal(isValidReadinessToken("some-valid-token-string"), true);
    assert.equal(isValidReadinessToken(""), false);
    assert.equal(isValidReadinessToken("short"), false);
  });

  it("exposes the new proxy functions", () => {
    assert.equal(typeof proxyToken, "function");
    assert.equal(typeof proxySubmit, "function");
  });
});
