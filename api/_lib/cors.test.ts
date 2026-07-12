/**
 * Edge CORS origin-policy tests: exact production allowlist, documented vygo
 * Vercel preview origins, and rejection of unrelated origins (no `*` wildcard).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateOrigin, isVercelPreviewOrigin, resolveAllowedOrigins } from "./http.js";

const allow = resolveAllowedOrigins({});

function decide(origin: string) {
  return evaluateOrigin({ origin }, allow);
}

describe("edge CORS — production origins", () => {
  it("allows the production marketing origins", () => {
    assert.equal(decide("https://www.vygo.ai").allowed, true);
    assert.equal(decide("https://vygo.ai").allowed, true);
  });

  it("allows extra origins configured via CORS_ORIGINS", () => {
    const set = resolveAllowedOrigins({ CORS_ORIGINS: "https://staging.vygo.ai" });
    assert.equal(evaluateOrigin({ origin: "https://staging.vygo.ai" }, set).allowed, true);
  });
});

describe("edge CORS — vygo Vercel preview origins", () => {
  it("allows documented vygo preview subdomains", () => {
    assert.equal(isVercelPreviewOrigin("https://vygo-git-main-southu.vercel.app"), true);
    assert.equal(isVercelPreviewOrigin("https://vygo-abc123-southu.vercel.app"), true);
    assert.equal(isVercelPreviewOrigin("https://vygo.vercel.app"), true);
    assert.equal(decide("https://vygo-git-main-southu.vercel.app").allowed, true);
  });

  it("rejects non-vygo *.vercel.app and non-https previews", () => {
    assert.equal(isVercelPreviewOrigin("https://evil.vercel.app"), false);
    assert.equal(isVercelPreviewOrigin("https://vygofake.vercel.app"), false);
    assert.equal(isVercelPreviewOrigin("https://notvygo-x.vercel.app"), false);
    assert.equal(isVercelPreviewOrigin("http://vygo-x.vercel.app"), false);
  });
});

describe("edge CORS — unrelated origins", () => {
  it("does not allow an unrelated origin", () => {
    assert.equal(decide("https://evil.example.com").allowed, false);
    assert.equal(decide("https://attacker.com").allowed, false);
  });

  it("treats a missing Origin (server-to-server) as allowed with no reflected origin", () => {
    const decision = evaluateOrigin({}, allow);
    assert.equal(decision.allowed, true);
    assert.equal(decision.origin, null);
  });
});
