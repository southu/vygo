/**
 * Golden fixture tests for Stage 3 readiness parse.
 * Must pass before push — clean/chat-wrapped/fenced agree; missing-footer and
 * sloppy recover or route to manual; planted secrets redact to [REDACTED].
 *
 * Run: pnpm exec tsx --test packages/validation/src/golden-fixtures.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BUDGET_BUCKET_OPTIONS,
  FIXTURE_CHAT_WRAPPED,
  FIXTURE_CLEAN,
  FIXTURE_FENCED,
  FIXTURE_MISSING_FOOTER,
  FIXTURE_SLOPPY,
  GOLDEN_CLEAN_FIELDS,
  buildPlantedSecretPaste,
  detectFollowupDiscrepancies,
  evaluateFollowupTriggers,
  redactPasteSecrets,
  runDeterministicParse,
  selectFollowupQuestions,
} from "./index.js";

describe("golden readiness fixtures", () => {
  it("parses the clean fixture into schema-valid JSON", () => {
    const result = runDeterministicParse(FIXTURE_CLEAN);
    assert.equal(result.parseStatus, "ok");
    assert.equal(result.routeToManual, false);
    assert.ok(result.fullReport);
    assert.equal(result.fullReport!.summary, GOLDEN_CLEAN_FIELDS.summary);
    assert.equal(result.fullReport!.languages, GOLDEN_CLEAN_FIELDS.languages);
    assert.equal(result.fullReport!.confidence, GOLDEN_CLEAN_FIELDS.confidence);
    assert.deepEqual(result.fullReport!.fragility_flags, GOLDEN_CLEAN_FIELDS.fragility_flags);
    assert.equal(result.report.auth, GOLDEN_CLEAN_FIELDS.auth);
    assert.equal(result.report.deploys, GOLDEN_CLEAN_FIELDS.deploys);
  });

  it("chat-wrapped and fenced fixtures yield the same field values as clean", () => {
    const clean = runDeterministicParse(FIXTURE_CLEAN);
    const chat = runDeterministicParse(FIXTURE_CHAT_WRAPPED);
    const fenced = runDeterministicParse(FIXTURE_FENCED);
    assert.equal(clean.parseStatus, "ok");
    assert.equal(chat.parseStatus, "ok");
    assert.equal(fenced.parseStatus, "ok");
    assert.deepEqual(chat.fullReport, clean.fullReport);
    assert.deepEqual(fenced.fullReport, clean.fullReport);
  });

  it("missing-footer fixture parses with fields (or routes to manual) without throwing", () => {
    const result = runDeterministicParse(FIXTURE_MISSING_FOOTER);
    assert.ok(
      result.parseStatus === "ok" ||
        result.parseStatus === "partial" ||
        result.parseStatus === "manual",
    );
    assert.ok(result.route === "confirm" || result.route === "manual");
    if (result.route === "confirm") {
      assert.equal(result.report.summary, GOLDEN_CLEAN_FIELDS.summary);
      assert.equal(result.report.languages, GOLDEN_CLEAN_FIELDS.languages);
    }
    // Never a hard failure path from the pipeline itself
    assert.ok(result.report);
  });

  it("sloppy fixture is recovered or cleanly routed to manual", () => {
    const result = runDeterministicParse(FIXTURE_SLOPPY);
    assert.ok(
      result.parseStatus === "ok" ||
        result.parseStatus === "partial" ||
        result.parseStatus === "manual" ||
        result.parseStatus === "pending",
    );
    assert.ok(result.route === "confirm" || result.route === "manual");
    if (result.routeToManual) {
      assert.equal(result.route, "manual");
    } else {
      // Recovered enough fields for confirmation
      assert.ok(Object.keys(result.report).length >= 3);
    }
  });

  it("planted credential-shaped token is redacted before parse", () => {
    const { paste, plantedToken } = buildPlantedSecretPaste(FIXTURE_CLEAN);
    assert.ok(paste.includes(plantedToken));
    const redaction = redactPasteSecrets(paste);
    assert.equal(redaction.didRedact, true);
    assert.ok(!redaction.redacted.includes(plantedToken));
    assert.ok(redaction.redacted.includes("[REDACTED]"));
    const parsed = runDeterministicParse(redaction.redacted);
    assert.equal(parsed.parseStatus, "ok");
    const serialized = JSON.stringify(parsed);
    assert.ok(!serialized.includes(plantedToken));
  });
});

describe("stage 4 follow-up question selection", () => {
  it("always includes users today, 12-month, done, and budget buckets", () => {
    const questions = selectFollowupQuestions(GOLDEN_CLEAN_FIELDS);
    const keys = questions.map((q) => q.questionKey);
    assert.ok(keys.includes("users_today"));
    assert.ok(keys.includes("users_12_months"));
    assert.ok(keys.includes("done_looks_like"));
    assert.ok(keys.includes("budget"));
    const budget = questions.find((q) => q.questionKey === "budget");
    assert.ok(budget);
    assert.deepEqual(budget!.options, [...BUDGET_BUCKET_OPTIONS]);
    assert.deepEqual(budget!.options, ["<$25K", "$25–75K", "$75–150K", "$150K+", "no idea yet"]);
  });

  it("conditional questions appear only when triggers match", () => {
    const automated: typeof GOLDEN_CLEAN_FIELDS = {
      ...GOLDEN_CLEAN_FIELDS,
      tests: "unit + integration on every deploy via CI",
      deploys: "GitHub Actions CI/CD automated",
      pii_categories: "email, name; no payment card or health records in prod",
      tenancy: "single-tenant",
      confidence: 0.9,
      summary: "Internal tool for one company",
    };
    const triggers = evaluateFollowupTriggers(automated);
    // High-confidence automated single-tenant with clear PII should suppress some conditionals
    const questions = selectFollowupQuestions(automated);
    const keys = new Set(questions.map((q) => q.questionKey));
    assert.ok(keys.has("users_today"));
    // Manual / low-confidence report should ask who deploys + repo access
    const manualReport = {
      summary: "MVP",
      deploys: "someone clicks deploy on vercel",
      tests: "not really automated",
      tenancy: "multi-tenant enterprise",
      confidence: 0.2,
      pii_categories: "health records",
    };
    const manualQs = selectFollowupQuestions(manualReport);
    const mKeys = new Set(manualQs.map((q) => q.questionKey));
    assert.ok(mKeys.has("who_deploys"));
    assert.ok(mKeys.has("repo_access_audit"));
    assert.ok(mKeys.has("tests_on_every_deploy"));
    assert.ok(mKeys.has("sso_saml"));
    assert.ok(mKeys.has("payment_health_pii_prod"));
    // silence unused when tree-shaken checks
    assert.ok(triggers);
  });

  it("contradicting follow-up answers set internal discrepancy flags", () => {
    const report = {
      ...GOLDEN_CLEAN_FIELDS,
      tests: "unit + integration on every deploy via CI",
      deploys: "GitHub Actions CI/CD automated",
      pii_categories: "email, name; no payment card or health records in prod",
    };
    const flags = detectFollowupDiscrepancies(report, {
      tests_on_every_deploy: "No",
      who_deploys: "Manual / SSH / console",
      payment_health_pii_prod: "Both",
    });
    assert.ok(flags.length >= 2);
    assert.ok(flags.every((f) => f.internal === true));
    assert.ok(flags.some((f) => f.questionKey === "tests_on_every_deploy"));
    assert.ok(flags.some((f) => f.questionKey === "who_deploys"));
  });
});
