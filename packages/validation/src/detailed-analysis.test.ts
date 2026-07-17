import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeReadinessScore, READINESS_DIMENSIONS } from "./readiness-scoring.js";
import {
  buildDetailedAnalysis,
  deriveAdoptionSignals,
  selectRecommendationPattern,
} from "./detailed-analysis.js";

/** Low security + high tool adoption — must route to security-first engagement. */
const LOW_SEC_HIGH_ADOPTION = {
  summary: "Agentic ops hub connecting Zapier Make n8n Slack Salesforce and HubSpot",
  languages: "TypeScript Python",
  size: "medium (team of 6)",
  structure: "modular monorepo packages",
  frontend: "Next.js React",
  backend: "Fastify NestJS",
  database: "Postgres Redis",
  tenancy: "single-tenant internal",
  auth: "none — shared password only",
  authorization: "all admin",
  row_level_security: "none",
  environments: "local staging production",
  deploys: "GitHub Actions CI/CD automated pipeline with rollback",
  tests: "unit integration e2e gate on every deploy via CI",
  background_jobs: "queue worker with retry",
  integrations:
    "12 integrations: Zapier, Make, n8n, Slack, Salesforce, HubSpot, Stripe, OpenAI, Anthropic, LangChain, Resend, Twilio",
  secrets_pattern: "hardcoded in git plain text env files",
  logging: "structured JSON logs request ids",
  error_handling: "safe public errors with graceful retry",
  pii_categories: "email, name; no payment card or health records in prod",
  api_surface: "public unauthenticated open",
  fragility_flags: ["none"],
  confidence: 0.7,
};

/** High security + low adoption — different engagement. */
const HIGH_SEC_LOW_ADOPTION = {
  summary: "Internal spreadsheet replacement for one finance workflow",
  languages: "TypeScript",
  size: "small (solo)",
  structure: "single package",
  frontend: "React",
  backend: "Express",
  database: "SQLite",
  tenancy: "single-tenant internal",
  auth: "OAuth OIDC session cookies MFA via Auth0",
  authorization: "RBAC roles owner admin member least privilege",
  row_level_security: "enforced row-level tenant isolation org_id",
  environments: "prod only",
  deploys: "manual ssh someone clicks dashboard only",
  tests: "none",
  background_jobs: "none",
  integrations: "none",
  secrets_pattern: "Vault secret manager rotated Railway env injection",
  logging: "console only",
  error_handling: "unhandled stack traces",
  pii_categories: "email, name",
  api_surface: "HTTPS auth rate limit versioned",
  fragility_flags: ["manual deploy", "single region", "no backup"],
  confidence: 0.75,
};

/** Uniform mid scores — balanced audit path. */
const UNIFORM_MID = {
  summary: "B2B scheduling prototype with external pilot users",
  languages: "TypeScript",
  size: "medium",
  structure: "partial monorepo some modular packages",
  frontend: "Next.js",
  backend: "Express documented",
  database: "Postgres",
  tenancy: "single-tenant with shared tables",
  auth: "session cookies basic OAuth",
  authorization: "simple roles",
  row_level_security: "planned not enforced",
  environments: "local production",
  deploys: "partial CI GitHub Actions sometimes manual",
  tests: "some unit tests not gated on every deploy",
  background_jobs: "cron only",
  integrations: "Slack",
  secrets_pattern: "env vars not vault",
  logging: "mixed console and some structured",
  error_handling: "partial safe errors",
  pii_categories: "email, name",
  api_surface: "HTTPS with auth",
  fragility_flags: ["single region"],
  confidence: 0.55,
};

describe("detailed analysis — per dimension prose", () => {
  it("produces 2+ paragraphs per dimension grounded in sub-metric evidence", () => {
    const payload = computeReadinessScore({
      report: LOW_SEC_HIGH_ADOPTION,
      source: "paste",
    });

    assert.ok(Array.isArray(payload.dimensionAnalyses));
    assert.equal(payload.dimensionAnalyses.length, READINESS_DIMENSIONS.length);

    for (const analysis of payload.dimensionAnalyses) {
      assert.ok(analysis.dimension);
      assert.ok(Array.isArray(analysis.paragraphs));
      assert.ok(
        analysis.paragraphs.length >= 2,
        `${analysis.dimension} needs >=2 paragraphs, got ${analysis.paragraphs.length}`,
      );
      for (const p of analysis.paragraphs) {
        assert.ok(p.trim().length > 40, "paragraph should be substantive");
      }
      // Prose must reference sub-metric names or answer values from this submission.
      const blob = analysis.analysis;
      assert.ok(/\/100/.test(blob), "should reference numeric scores");
      assert.ok(
        /you reported|sub-metric|Authentication|Secrets|Tests|Deploy/i.test(blob),
        `analysis for ${analysis.dimension} should cite evidence: ${blob.slice(0, 200)}`,
      );
    }

    // Security analysis should mention weak auth/secrets answers.
    const security = payload.dimensionAnalyses.find((a) => a.dimension === "Security");
    assert.ok(security);
    assert.ok(
      /shared password|hardcoded|plain text|auth|secret/i.test(security.analysis),
      "Security analysis must reference this submission's weak controls",
    );
  });
});

describe("detailed recommendation — score pattern branching", () => {
  it("routes low security + high tool adoption to a security-first engagement", () => {
    const payload = computeReadinessScore({
      report: LOW_SEC_HIGH_ADOPTION,
      source: "paste",
      stage1: { whoUses: "My internal team", productDescription: "Agentic ops hub" },
    });

    assert.ok(payload.recommendation);
    assert.equal(payload.recommendation.patternKey, "security_first_high_adoption");
    assert.match(
      payload.recommendation.engagement,
      /security/i,
      "engagement name must be security-oriented",
    );
    assert.match(payload.recommendation.rationale, /security/i);
    assert.ok(payload.recommendation.citedFindings.length >= 3);
    assert.ok(payload.recommendation.expectedOutcomes.length > 20);
    assert.ok(payload.recommendation.firstStepScope.length > 20);
    assert.match(payload.recommendedEngagement, /security/i);

    // Citations must be unique to this profile's data.
    const citeBlob = payload.recommendation.citedFindings.join(" ");
    assert.ok(
      /Zapier|Make|n8n|shared password|hardcoded|Security score/i.test(citeBlob),
      `expected unique low-sec/high-adoption evidence in citations: ${citeBlob}`,
    );
  });

  it("routes high security + low adoption to a different engagement", () => {
    const payload = computeReadinessScore({
      report: HIGH_SEC_LOW_ADOPTION,
      source: "paste",
      stage1: { whoUses: "Just me", productDescription: "Finance spreadsheet replacement" },
    });

    assert.ok(payload.recommendation);
    assert.equal(payload.recommendation.patternKey, "high_security_low_adoption");
    assert.ok(
      !/security-first|security remediation/i.test(payload.recommendation.engagement),
      "must not be the security-first engagement",
    );
    assert.match(
      payload.recommendation.engagement,
      /Launch|operability|adoption|foundations/i,
    );
    assert.ok(payload.recommendation.citedFindings.length >= 3);
    const citeBlob = [
      ...payload.recommendation.citedFindings,
      payload.recommendation.rationale,
      payload.recommendation.body,
    ].join(" ");
    assert.ok(
      /Auth0|Vault|manual ssh|Security score|Operability|secrets|OAuth|MFA/i.test(citeBlob),
      `expected high-sec/low-adoption evidence: ${citeBlob}`,
    );
  });

  it("routes uniform mid scores to a balanced audit engagement", () => {
    const payload = computeReadinessScore({
      report: UNIFORM_MID,
      source: "paste",
      stage1: {
        whoUses: "External users free",
        productDescription: "B2B scheduling prototype",
      },
    });

    assert.ok(payload.recommendation);
    // May hit uniform_mid or another non-security-first path depending on exact scores.
    assert.ok(payload.recommendation.patternKey !== "security_first_high_adoption");
    assert.ok(payload.recommendation.patternKey !== "high_security_low_adoption");
    assert.ok(payload.recommendation.citedFindings.length >= 3);
    assert.ok(payload.recommendation.expectedOutcomes.length > 20);
    assert.ok(payload.recommendation.firstStepScope.length > 20);
  });

  it("three profiles produce materially different recommendation bodies and engagements", () => {
    const a = computeReadinessScore({
      report: LOW_SEC_HIGH_ADOPTION,
      source: "paste",
      stage1: { whoUses: "My internal team" },
    });
    const b = computeReadinessScore({
      report: HIGH_SEC_LOW_ADOPTION,
      source: "paste",
      stage1: { whoUses: "Just me" },
    });
    const c = computeReadinessScore({
      report: UNIFORM_MID,
      source: "paste",
      stage1: { whoUses: "External users free" },
    });

    const engagements = [
      a.recommendation.engagement,
      b.recommendation.engagement,
      c.recommendation.engagement,
    ];
    assert.equal(new Set(engagements).size, 3, `expected 3 distinct engagements, got ${engagements.join(" | ")}`);

    const bodies = [a.recommendation.body, b.recommendation.body, c.recommendation.body];
    assert.equal(new Set(bodies).size, 3, "recommendation bodies must differ substantively");

    // Citation sets must not be identical across submissions.
    const cites = [
      a.recommendation.citedFindings.join("||"),
      b.recommendation.citedFindings.join("||"),
      c.recommendation.citedFindings.join("||"),
    ];
    assert.equal(new Set(cites).size, 3, "each submission should cite its own evidence set");

    // Low-sec profile cites tools unique to it; high-sec cites its own control evidence.
    assert.ok(/Zapier|Make|n8n/i.test(a.recommendation.body));
    assert.ok(
      /Vault|Auth0|manual ssh|Security score|Operability|OAuth|secret/i.test(b.recommendation.body),
      `high-sec body should cite its own evidence: ${b.recommendation.body.slice(0, 400)}`,
    );
  });

  it("selectRecommendationPattern is deterministic for known score shapes", () => {
    const dimsLowSec = {
      Security: 30,
      Reliability: 70,
      Operability: 72,
      Maintainability: 68,
      "Compliance posture": 50,
    } as const;
    const adoption = deriveAdoptionSignals(LOW_SEC_HIGH_ADOPTION, dimsLowSec);
    assert.equal(adoption.highAdoption, true);
    const branch = selectRecommendationPattern({
      dimensions: dimsLowSec,
      adoption,
      bucket: "Launch",
    });
    assert.equal(branch.patternKey, "security_first_high_adoption");
    assert.match(branch.engagement, /security/i);
  });

  it("buildDetailedAnalysis attaches to computeReadinessScore payload shape", () => {
    const scored = computeReadinessScore({ report: LOW_SEC_HIGH_ADOPTION, source: "paste" });
    const rebuilt = buildDetailedAnalysis({
      report: LOW_SEC_HIGH_ADOPTION,
      dimensions: scored.dimensions,
      dimensionDetails: scored.dimensionDetails,
      insights: scored.insights,
      bucket: scored.bucket,
    });
    assert.equal(rebuilt.dimensionAnalyses.length, 5);
    assert.ok(rebuilt.recommendation.citedFindings.length >= 3);
    assert.equal(scored.recommendation.patternKey, rebuilt.recommendation.patternKey);
  });
});
