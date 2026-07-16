import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SCORING_CONFIG,
  assignEngagementBucket,
  computeReadinessScore,
  containsRemediationDetail,
  deriveBucketSignals,
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
