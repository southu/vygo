import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAnalyticsConsent } from "./consent";

test("parseAnalyticsConsent returns true only when analytics is explicitly allowed", () => {
  assert.equal(parseAnalyticsConsent(JSON.stringify({ analytics: true })), true);
});

test("parseAnalyticsConsent returns false for denied / absent analytics", () => {
  assert.equal(parseAnalyticsConsent(JSON.stringify({ analytics: false })), false);
  assert.equal(parseAnalyticsConsent(JSON.stringify({})), false);
  assert.equal(parseAnalyticsConsent(null), false);
  assert.equal(parseAnalyticsConsent(""), false);
});

test("parseAnalyticsConsent is default-deny on corrupt storage", () => {
  assert.equal(parseAnalyticsConsent("{not json"), false);
  assert.equal(parseAnalyticsConsent("true"), false);
});
