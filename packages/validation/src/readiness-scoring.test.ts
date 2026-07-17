import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SCORING_CONFIG,
  READINESS_DIMENSIONS,
  assignEngagementBucket,
  computeReadinessScore,
  containsRemediationDetail,
  deriveBucketSignals,
  scoreAllDimensionDetails,
  scoreAllDimensions,
  scoreFieldValue,
} from "./readiness-scoring.js";
import type { ReadinessReportV1Partial } from "./report-schema.js";

const UNKNOWN_REPORT: ReadinessReportV1Partial = {
  summary: "unknown",
  languages: "unknown",
  size: "unknown",
  structure: "unknown",
  frontend: "unknown",
  backend: "unknown",
  database: "unknown",
  tenancy: "unknown",
  auth: "unknown",
  authorization: "unknown",
  row_level_security: "unknown",
  environments: "unknown",
  deploys: "unknown",
  tests: "unknown",
  background_jobs: "unknown",
  integrations: "unknown",
  secrets_pattern: "unknown",
  logging: "unknown",
  error_handling: "unknown",
  pii_categories: "unknown",
  api_surface: "unknown",
  fragility_flags: "unknown",
  confidence: 0.25,
};

const HARDEN_REPORT: ReadinessReportV1Partial = {
  summary: "Internal ops tool for inventory approvals",
  languages: "TypeScript",
  size: "small",
  structure: "modular monorepo packages",
  frontend: "Next.js",
  backend: "Fastify",
  database: "Postgres",
  tenancy: "single-tenant internal",
  auth: "session cookies + magic link",
  authorization: "RBAC roles owner admin member",
  row_level_security: "enforced via app middleware",
  environments: "local staging production",
  deploys: "GitHub Actions CI/CD automated pipeline with rollback",
  tests: "unit integration e2e gate on every deploy via CI",
  background_jobs: "email outbox worker with retry",
  integrations: "Slack",
  secrets_pattern: "Railway env + Vault references",
  logging: "structured JSON logs request ids",
  error_handling: "safe public errors with graceful retry",
  pii_categories: "email, name; no payment card or health records in prod",
  api_surface: "HTTPS /v1 versioned API with auth",
  fragility_flags: ["single_region"],
  confidence: 0.85,
};

const ENTERPRISE_REPORT: ReadinessReportV1Partial = {
  summary: "B2B multi-tenant SaaS with enterprise SSO pressure and SOC 2 questionnaire",
  languages: "TypeScript",
  size: "large",
  structure: "services monorepo",
  frontend: "Next.js",
  backend: "Fastify",
  database: "Postgres",
  tenancy: "multi-tenant org_id on every row",
  auth: "SAML SSO enterprise IdP required",
  authorization: "RBAC",
  row_level_security: "planned",
  environments: "staging production",
  deploys: "partial CI",
  tests: "unit tests exist but never run on deploy; no CI gate",
  background_jobs: "none",
  integrations: "Salesforce",
  secrets_pattern: "env vars",
  logging: "console only",
  error_handling: "stack traces sometimes",
  pii_categories: "payment cards and health records in prod",
  api_surface: "HTTPS",
  fragility_flags: ["manual migrate", "no backup tested"],
  confidence: 0.55,
};

describe("readiness scoring", () => {
  it("scores unknown fields near the configured risk percentile (~25), not midpoint", () => {
    const scores = scoreAllDimensions(UNKNOWN_REPORT, DEFAULT_SCORING_CONFIG);
    for (const [label, value] of Object.entries(scores)) {
      assert.ok(
        value >= 15 && value <= 35,
        `${label} should be ~25th percentile risk, got ${value}`,
      );
      assert.ok(value < 45, `${label} must not be neutral/midpoint, got ${value}`);
    }
  });

  it("uses config unknownPercentile for empty fields", () => {
    const rule = DEFAULT_SCORING_CONFIG.dimensions[0]!.fields[0]!;
    const s = scoreFieldValue("unknown", rule, 0.25);
    assert.equal(s, 25);
  });

  it("buckets Harden for internal-only solid tool", () => {
    const dimensions = scoreAllDimensions(HARDEN_REPORT, DEFAULT_SCORING_CONFIG);
    const signals = deriveBucketSignals(HARDEN_REPORT, dimensions, {
      whoUses: "My internal team",
      productDescription: "Inventory approvals",
      builtWith: "Cursor",
      blockers: ["nothing broken — want solid before launch"],
      deadline: "No hard deadline",
      deadlineDetail: "",
    });
    const result = assignEngagementBucket(signals);
    assert.equal(result.bucket, "Harden");
  });

  it("buckets Enterprise for multi-tenant SSO/compliance pressure", () => {
    const dimensions = scoreAllDimensions(ENTERPRISE_REPORT, DEFAULT_SCORING_CONFIG);
    const signals = deriveBucketSignals(ENTERPRISE_REPORT, dimensions, {
      whoUses: "Enterprise customers or enterprise sales cycle",
      productDescription: "B2B SaaS",
      builtWith: "Cursor",
      blockers: ["security questionnaire or review blocking a deal"],
      deadline: "Yes within 30 days",
      deadlineDetail: "SOC2",
    });
    const result = assignEngagementBucket(signals);
    assert.equal(result.bucket, "Enterprise");
  });

  it("defaults ambiguous profiles to Launch with talk-to-us caveat", () => {
    const mixed: ReadinessReportV1Partial = {
      ...HARDEN_REPORT,
      summary: "Mixed signals product",
      tenancy: "unclear",
      auth: "email magic link",
      tests: "some unit tests",
      deploys: "manual sometimes",
    };
    // Force non-matching by clearing internal/external extremes via empty whoUses
    // and mid scores — use explicit override signals path via assign with custom.
    const signals = deriveBucketSignals(
      mixed,
      {
        Security: 50,
        Reliability: 50,
        Operability: 50,
        Maintainability: 50,
        "Compliance posture": 50,
      },
      {
        whoUses: "",
        productDescription: "Something",
        builtWith: "Cursor",
        blockers: [],
        deadline: "No hard deadline",
        deadlineDetail: "",
      },
    );
    // Ensure we don't hit harden/enterprise/scale/launch rules cleanly
    signals.internalOnly = false;
    signals.externalUsers = false;
    signals.solidTool = false;
    signals.foundationalGaps = false;
    signals.payingUsers = false;
    signals.securityQuestionnaire = false;
    signals.multiTenantOrEnterprise = false;
    signals.ssoOrCompliancePressure = false;
    signals.notAFit = false;
    const result = assignEngagementBucket(signals);
    assert.equal(result.bucket, "Launch");
    assert.ok(result.caveat && /talk to us/i.test(result.caveat));
  });

  it("manual source uses range display mode and cites findings as headlines only", () => {
    const payload = computeReadinessScore({
      report: HARDEN_REPORT,
      source: "manual",
      stage1: {
        whoUses: "My internal team",
        productDescription: "Inventory tool",
        builtWith: "Cursor",
        blockers: ["nothing broken — want solid before launch"],
        deadline: "No hard deadline",
        deadlineDetail: "",
      },
    });
    assert.equal(payload.displayMode, "range");
    assert.ok(payload.ranges);
    assert.equal(payload.findings.length, 3);
    for (const f of payload.findings) {
      assert.equal(containsRemediationDetail(f), false);
      assert.doesNotMatch(f, /how to fix|remediat/i);
    }
    assert.ok(payload.reasoning.length > 40);
    assert.ok(/Inventory|internal|team|Security|Reliability/i.test(payload.reasoning));
  });

  it("Harden CTA and offer key are correct", () => {
    const payload = computeReadinessScore({
      report: HARDEN_REPORT,
      source: "paste",
      stage1: {
        whoUses: "Just me",
        productDescription: "Ops tool",
        builtWith: "Cursor",
        blockers: ["nothing broken — want solid before launch"],
        deadline: "No hard deadline",
        deadlineDetail: "",
      },
    });
    assert.equal(payload.bucket, "Harden");
    assert.equal(payload.ctaLabel, "Start free Harden assessment");
    assert.equal(payload.offerKey, "harden");
  });

  it("returns detailed nested sub-metrics (checks) for all five dimensions", () => {
    const payload = computeReadinessScore({ report: HARDEN_REPORT, source: "paste" });
    assert.ok(payload.dimensionDetails, "payload must include dimensionDetails");
    for (const label of READINESS_DIMENSIONS) {
      const detail = payload.dimensionDetails[label];
      assert.ok(detail, `dimensionDetails must include ${label}`);
      assert.equal(detail.label, label);
      assert.ok(detail.checks.length >= 2, `${label} must break down into multiple checks`);
      assert.equal(
        detail.score,
        payload.dimensions[label],
        `${label} aggregate must match the dimension score`,
      );
      for (const check of detail.checks) {
        assert.ok(check.key.length > 0, "check key present");
        assert.ok(check.label.length > 0, "check label present");
        assert.equal(check.name, check.label, "name aliases label");
        assert.ok(check.score >= 0 && check.score <= 100, "check score in 0–100");
        assert.ok(check.weight > 0, "check weight positive");
        assert.ok(
          ["strong", "adequate", "at_risk", "unknown"].includes(check.status),
          "check status is a known band",
        );
        assert.ok(check.evidence, "evidence present");
        assert.equal(check.evidence.question_id, check.key);
        assert.ok(
          check.evidence.answer_value != null && String(check.evidence.answer_value).length > 0,
          "answer_value present for answered field",
        );
        assert.ok(
          typeof check.evidence.reason === "string" && check.evidence.reason.length > 10,
          "reason is a non-empty plain-English string",
        );
        assert.notEqual(check.evidence.reason, "N/A");
      }
      assert.ok(Array.isArray(detail.sub_metrics));
      assert.equal(detail.sub_metrics.length, detail.checks.length);
    }
    const securityKeys = payload.dimensionDetails.Security.checks.map((c) => c.key);
    assert.ok(securityKeys.includes("auth"), "Security breaks down into auth");
    assert.ok(securityKeys.includes("secrets_pattern"), "Security breaks down into secrets");
  });

  it("returns mission-shaped dimensionResults with evidence on every sub-metric", () => {
    const weak = computeReadinessScore({
      report: {
        ...UNKNOWN_REPORT,
        auth: "none — shared password only",
        authorization: "all admin",
        row_level_security: "none",
        secrets_pattern: "hardcoded in git",
        api_surface: "public unauthenticated open",
        tests: "none",
        error_handling: "unhandled stack traces",
        background_jobs: "fire and forget",
        fragility_flags: ["single region", "no backup", "manual migrate"],
        logging: "console only",
        deploys: "manual ssh",
        environments: "prod only",
        structure: "spaghetti god module",
        languages: "unknown mixed undocumented",
        size: "huge unknown",
        frontend: "unknown",
        backend: "unknown",
        pii_categories: "payment cards and health records",
        tenancy: "shared without isolation",
        summary: "risky prototype",
        confidence: 0.4,
      },
      source: "paste",
    });
    const strong = computeReadinessScore({ report: HARDEN_REPORT, source: "paste" });

    assert.ok(Array.isArray(weak.dimensionResults));
    assert.equal(weak.dimensionResults.length, READINESS_DIMENSIONS.length);

    for (const dim of weak.dimensionResults) {
      assert.equal(typeof dim.dimension, "string");
      assert.ok(dim.dimension.length > 0);
      assert.equal(typeof dim.score, "number");
      assert.ok(Array.isArray(dim.sub_metrics));
      assert.ok(
        dim.sub_metrics.length >= 4 && dim.sub_metrics.length <= 6,
        `${dim.dimension} must have 4–6 sub_metrics, got ${dim.sub_metrics.length}`,
      );
      for (const sm of dim.sub_metrics) {
        assert.ok(typeof sm.name === "string" && sm.name.length > 0);
        assert.equal(typeof sm.score, "number");
        assert.equal(typeof sm.weight, "number");
        assert.ok(sm.evidence);
        assert.ok(
          typeof sm.evidence.question_id === "string" && sm.evidence.question_id.length > 0,
        );
        assert.ok(sm.evidence.answer_value != null && sm.evidence.answer_value !== "");
        assert.ok(typeof sm.evidence.reason === "string" && sm.evidence.reason.length > 10);
        assert.ok(/you (reported|did not answer)/i.test(sm.evidence.reason));
        assert.notEqual(sm.evidence.reason, "N/A");
      }
    }

    // Different answer sets → visibly different dimension scores.
    let anyDimDiffers = false;
    for (const label of READINESS_DIMENSIONS) {
      if (weak.dimensions[label] !== strong.dimensions[label]) anyDimDiffers = true;
    }
    assert.ok(anyDimDiffers, "weak vs strong reports must produce different dimension scores");

    // Within each payload, not all dimensions share the same score.
    const weakScores = weak.dimensionResults.map((d) => d.score);
    const strongScores = strong.dimensionResults.map((d) => d.score);
    assert.ok(new Set(weakScores).size > 1, "weak payload dimensions must not all be equal");
    assert.ok(new Set(strongScores).size > 1, "strong payload dimensions must not all be equal");

    // Not pinned at the old flat default of 25 for both submissions.
    const weakAll25 = weakScores.every((s) => s === 25);
    const strongAll25 = strongScores.every((s) => s === 25);
    assert.ok(
      !(weakAll25 && strongAll25),
      "scores must be computed from answers, not pinned at 25",
    );

    // Reason strings are not identical boilerplate across all sub-metrics.
    const reasons = weak.dimensionResults.flatMap((d) =>
      d.sub_metrics.map((s) => s.evidence.reason),
    );
    assert.ok(new Set(reasons).size > 3, "reason strings must vary with answers");
  });

  it("marks unanswered sub-metrics unknown and scores them as risk", () => {
    const details = scoreAllDimensionDetails(UNKNOWN_REPORT, DEFAULT_SCORING_CONFIG);
    for (const label of READINESS_DIMENSIONS) {
      for (const check of details[label].checks) {
        assert.equal(check.answered, false, `${label}/${check.key} should be unanswered`);
        assert.equal(check.status, "unknown");
        assert.equal(check.score, 25, "unknown checks score at the risk percentile");
        assert.equal(check.evidence.question_id, check.key);
        assert.ok(check.evidence.reason.length > 0);
        assert.match(check.evidence.reason, /did not answer/i);
      }
    }
  });

  it("non-Harden CTA is apply for audit opening", () => {
    const payload = computeReadinessScore({
      report: ENTERPRISE_REPORT,
      source: "paste",
      stage1: {
        whoUses: "Enterprise customers or enterprise sales cycle",
        productDescription: "B2B SaaS",
        builtWith: "Cursor",
        blockers: ["security questionnaire or review blocking a deal"],
        deadline: "Yes within 30 days",
        deadlineDetail: "",
      },
    });
    assert.notEqual(payload.bucket, "Harden");
    assert.equal(payload.ctaLabel, "Apply for the next audit opening");
    assert.ok(payload.pricing.harden.includes("$9,500"));
    assert.ok(payload.pricing.launch.includes("$75K"));
    assert.ok(payload.pricing.scale.includes("$145K"));
    assert.ok(payload.pricing.enterprise.includes("$275K"));
    assert.ok(/\$15K audit is credited/i.test(payload.pricing.auditNote));
  });
});
