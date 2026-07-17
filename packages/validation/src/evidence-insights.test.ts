import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildEvidenceInsights,
  clipDisplayText,
  extractIntegrationCount,
  extractNamedTools,
  extractTeamSignals,
  INSIGHT_SOURCE_MAX_CHARS,
  type EvidenceInsight,
} from "./evidence-insights.js";
import { computeReadinessScore } from "./readiness-scoring.js";

/** Mission-shaped rich submission: tools, count, security gap, team size. */
const RICH_REPORT: Record<string, unknown> = {
  summary: "Agent ops stack with Zapier, Make, LangChain for internal automation",
  languages: "TypeScript",
  size: "Medium (small team of 8)",
  structure: "modular monorepo packages",
  frontend: "Next.js",
  backend: "Fastify",
  database: "Postgres",
  tenancy: "single-tenant internal",
  auth: "session cookies + MFA",
  authorization: "RBAC roles owner admin member",
  row_level_security: "enforced via app middleware",
  environments: "local staging production",
  deploys: "GitHub Actions CI/CD automated pipeline with rollback",
  tests: "unit integration e2e gate on every deploy via CI",
  background_jobs: "email outbox worker with retry",
  integrations: "Zapier, Make, LangChain — 12 integrations",
  secrets_pattern: "no centralized credential management — keys in env files",
  logging: "structured JSON logs request ids",
  error_handling: "safe public errors with graceful retry",
  pii_categories: "email, name; no payment card or health records in prod",
  api_surface: "HTTPS /v1 versioned API with auth",
  fragility_flags: ["manual secrets rotation"],
  confidence: 0.7,
};

const INSIGHT_KEYS = ["type", "headline", "detail", "source_answer", "dimension"] as const;

function assertInsightShape(insight: EvidenceInsight): void {
  const keys = Object.keys(insight).sort();
  assert.deepEqual(keys, [...INSIGHT_KEYS].sort());
  assert.ok(["strength", "risk", "opportunity"].includes(insight.type));
  for (const k of INSIGHT_KEYS) {
    if (k === "type") continue;
    assert.equal(typeof insight[k], "string");
    assert.ok(String(insight[k]).trim().length > 0, `${k} must be non-empty`);
  }
}

describe("evidence insights helpers", () => {
  it("extracts named tools in order of appearance", () => {
    const tools = extractNamedTools("We use Zapier, Make, and LangChain for agentic workflows");
    assert.deepEqual(tools, ["Zapier", "Make", "LangChain"]);
  });

  it("extracts numeric integration counts", () => {
    assert.equal(extractIntegrationCount("Zapier, Make — 12 integrations"), 12);
    assert.equal(extractIntegrationCount("3 agentic tools"), 3);
    assert.equal(extractIntegrationCount("no numbers here"), null);
  });

  it("extracts team size signals", () => {
    assert.ok(extractTeamSignals("Medium (small team of 8)")?.toLowerCase().includes("team"));
    assert.ok(extractTeamSignals("team of 5"));
  });
});

describe("buildEvidenceInsights", () => {
  it("returns at least 6 distinct ranked insights for a rich submission", () => {
    const insights = buildEvidenceInsights(RICH_REPORT);
    assert.ok(insights.length >= 6, `expected >= 6 insights, got ${insights.length}`);

    const seen = new Set<string>();
    for (const insight of insights) {
      assertInsightShape(insight);
      const key = `${insight.headline}||${insight.source_answer}`;
      assert.ok(!seen.has(key), `duplicate insight: ${key}`);
      seen.add(key);
    }
  });

  it("writes second-person copy and quotes submitted data", () => {
    const insights = buildEvidenceInsights(RICH_REPORT);
    const secondPerson = insights.filter((i) => /you|your/i.test(`${i.headline} ${i.detail}`));
    assert.ok(secondPerson.length >= 6);

    const tokens = ["Zapier", "Make", "LangChain", "12", "no centralized credential management", "team of 8"];
    let grounded = 0;
    for (const insight of insights) {
      const blob = `${insight.headline} ${insight.detail} ${insight.source_answer}`;
      if (tokens.some((t) => blob.includes(t))) grounded += 1;
    }
    assert.ok(grounded >= 6, `expected >= 6 grounded insights, got ${grounded}`);
  });

  it("includes at least one risk and one strength when gaps and goods are present", () => {
    const insights = buildEvidenceInsights(RICH_REPORT);
    assert.ok(insights.some((i) => i.type === "risk"), "expected a risk insight");
    assert.ok(insights.some((i) => i.type === "strength"), "expected a strength insight");
  });

  it("is ranked stably for the same payload", () => {
    const a = buildEvidenceInsights(RICH_REPORT);
    const b = buildEvidenceInsights(RICH_REPORT);
    assert.deepEqual(
      a.map((i) => i.headline),
      b.map((i) => i.headline),
    );
    assert.ok(Array.isArray(a));
  });
});

describe("sparse and long free-text insights", () => {
  it("clipDisplayText truncates with ellipsis and never returns whitespace-only", () => {
    assert.equal(clipDisplayText("   "), "");
    assert.equal(clipDisplayText("short"), "short");
    const long = "A".repeat(500);
    const clipped = clipDisplayText(long, 40);
    assert.ok(clipped.length <= 40);
    assert.ok(clipped.endsWith("…"));
  });

  it("sparse report yields fewer insights and no empty source quotes", () => {
    const sparse = buildEvidenceInsights({ summary: "x", tests: "none" });
    const rich = buildEvidenceInsights(RICH_REPORT);
    assert.ok(
      sparse.length <= rich.length,
      `sparse (${sparse.length}) should not exceed rich (${rich.length})`,
    );
    assert.ok(sparse.length < rich.length || sparse.length <= 3, "sparse should degrade");
    for (const insight of sparse) {
      assertInsightShape(insight);
      assert.ok(insight.source_answer.trim().length > 0, "never empty source_answer");
    }
  });

  it("empty report fabricates no insights", () => {
    const empty = buildEvidenceInsights({});
    assert.equal(empty.length, 0);
  });

  it("very long free-text answers are truncated in source_answer and detail", () => {
    const long = `Production secrets gap: ${"x".repeat(2200)}`;
    const insights = buildEvidenceInsights({
      summary: long,
      secrets_pattern: long,
      integrations: "Zapier, Make — 5 integrations",
      tests: "none",
    });
    assert.ok(insights.length >= 1);
    for (const insight of insights) {
      assert.ok(
        insight.source_answer.length <= INSIGHT_SOURCE_MAX_CHARS,
        `source_answer too long: ${insight.source_answer.length}`,
      );
      assert.ok(insight.detail.length <= 480, `detail too long: ${insight.detail.length}`);
      assert.ok(!insight.source_answer.includes("x".repeat(500)), "raw overflow retained");
    }
  });
});

describe("computeReadinessScore insights payload", () => {
  it("attaches insights alongside overall score and dimensionResults", () => {
    const payload = computeReadinessScore({ report: RICH_REPORT, source: "paste" });
    assert.equal(typeof payload.overall, "number");
    assert.ok(payload.dimensions);
    assert.ok(Array.isArray(payload.dimensionResults));
    assert.ok(Array.isArray(payload.insights));
    assert.ok(payload.insights.length >= 6);
    for (const insight of payload.insights) {
      assertInsightShape(insight);
    }
  });
});
