import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAnalyticsConsent, readAnalyticsConsentDecision } from "./consent";

test("parseAnalyticsConsent returns true only when analytics is explicitly allowed", () => {
  assert.equal(parseAnalyticsConsent(JSON.stringify({ analytics: true })), true);
});

test("parseAnalyticsConsent returns false for denied / absent analytics", () => {
  assert.equal(parseAnalyticsConsent(JSON.stringify({ analytics: false })), false);
  assert.equal(parseAnalyticsConsent(JSON.stringify({})), false);
  assert.equal(parseAnalyticsConsent(null), false);
  assert.equal(parseAnalyticsConsent(""), false);
});

test("parseAnalyticsConsent treats corrupt storage as no explicit grant", () => {
  assert.equal(parseAnalyticsConsent("{not json"), false);
  assert.equal(parseAnalyticsConsent("true"), false);
});

// --- tri-state decision: default-allow, deny only on explicit opt-out --------

test("readAnalyticsConsentDecision distinguishes granted / denied / unset", () => {
  assert.equal(readAnalyticsConsentDecision(JSON.stringify({ analytics: true })), "granted");
  assert.equal(readAnalyticsConsentDecision(JSON.stringify({ analytics: false })), "denied");
  // Absent / empty / no explicit analytics field => unset => app default (allowed).
  assert.equal(readAnalyticsConsentDecision(null), "unset");
  assert.equal(readAnalyticsConsentDecision(""), "unset");
  assert.equal(readAnalyticsConsentDecision(JSON.stringify({})), "unset");
});

test("readAnalyticsConsentDecision is unset (not denied) on corrupt storage", () => {
  // Corrupt storage must not silently opt the visitor out — the default stands.
  assert.equal(readAnalyticsConsentDecision("{not json"), "unset");
  assert.equal(readAnalyticsConsentDecision("true"), "unset");
});
