import assert from "node:assert/strict";
import { test } from "node:test";
import {
  countBySeverity,
  inferArea,
  inferSeverity,
  parseFinding,
  parseFindings,
  summarize,
  summarizeCounts,
} from "./findings";

test("inferSeverity flags negatives as attention", () => {
  assert.equal(inferSeverity("no MFA, magic-link only"), "attention");
  assert.equal(inferSeverity("Secrets hardcoded in repo"), "attention");
  assert.equal(inferSeverity("single point of failure"), "attention");
});

test("inferSeverity flags soft gaps as warning", () => {
  assert.equal(inferSeverity("Partial test coverage, needs review"), "warning");
  assert.equal(inferSeverity("Manual deploys, basic pipeline"), "warning");
});

test("inferSeverity recognizes healthy state as ok", () => {
  assert.equal(inferSeverity("Auth configured with sessions"), "ok");
  assert.equal(inferSeverity("Deploys automated via Railway"), "ok");
});

test("inferSeverity treats 'no issues' as ok, not attention", () => {
  assert.equal(inferSeverity("Reviewed, no issues found"), "ok");
});

test("inferSeverity falls back to neutral when unreadable", () => {
  assert.equal(inferSeverity("Postgres 15"), "neutral");
  assert.equal(inferSeverity(""), "neutral");
});

test("inferArea uses prefix mapping then keywords", () => {
  assert.equal(inferArea("Auth", "x"), "Auth");
  assert.equal(inferArea("Secrets", "x"), "Security");
  assert.equal(inferArea("Backend", "x"), "API");
  assert.equal(inferArea(null, "oauth login flow"), "Auth");
  assert.equal(inferArea(null, "opaque text"), "General");
});

test("summarize trims to a short lead phrase", () => {
  const s = summarize(
    "Supabase magic-link auth is enabled, but there is no MFA and sessions never expire",
  );
  assert.ok(s.length <= 62);
  assert.equal(s.startsWith("Supabase magic-link auth"), true);
});

test("parseFinding splits area prefix from body", () => {
  const f = parseFinding("Auth: magic-link only, no MFA");
  assert.equal(f.area, "Auth");
  assert.equal(f.severity, "attention");
  assert.equal(f.detail, "magic-link only, no MFA");
  assert.ok(f.summary.length > 0);
});

test("parseFindings orders severity-first and drops nothing", () => {
  const raw = [
    "Deploy: automated via Railway", // ok
    "Auth: no MFA", // attention
    "Tests: partial coverage", // warning
    "Notes: Postgres 15", // neutral
  ];
  const parsed = parseFindings(raw);
  assert.equal(parsed.length, raw.length);
  assert.deepEqual(
    parsed.map((f) => f.severity),
    ["attention", "warning", "ok", "neutral"],
  );
});

test("parseFindings keeps duplicate findings", () => {
  const parsed = parseFindings(["Auth: no MFA", "Auth: no MFA"]);
  assert.equal(parsed.length, 2);
});

test("countBySeverity and summary reflect actual counts", () => {
  const parsed = parseFindings([
    "Auth: no MFA",
    "Secrets: exposed key",
    "Tests: partial coverage",
    "Deploy: automated",
  ]);
  const counts = countBySeverity(parsed);
  assert.equal(counts.attention, 2);
  assert.equal(counts.warning, 1);
  assert.equal(counts.ok, 1);
  assert.equal(summarizeCounts(counts), "2 need attention · 1 warning · 1 ok");
});
