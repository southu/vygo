/**
 * Database-free tests for readiness session validation and route registration.
 * Persistence is proven live via POST/PATCH/GET /v1/readiness/session.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadApiEnv } from "@vygo/config";
import {
  READINESS_REPORT_V1_END,
  READINESS_REPORT_V1_FIELDS,
  READINESS_REPORT_V1_START,
  formatReadinessReportV1,
  parseReadinessReportV1,
  type ReadinessReportV1,
} from "@vygo/validation";
import { redactSensitivePaste, redactSessionDraft, generateReadinessSessionToken } from "@vygo/db";
import { stripNullBytes, stripNullBytesDeep } from "@vygo/validation";
import { buildApp, type AppContext, MemoryRateLimitStore } from "../src/app.js";

describe("readiness report schema contract", () => {
  it("exposes the fixed v1 field set", () => {
    assert.deepEqual(
      [...READINESS_REPORT_V1_FIELDS],
      [
        "summary",
        "languages",
        "size",
        "structure",
        "frontend",
        "backend",
        "database",
        "tenancy",
        "auth",
        "authorization",
        "row_level_security",
        "environments",
        "deploys",
        "tests",
        "background_jobs",
        "integrations",
        "secrets_pattern",
        "logging",
        "error_handling",
        "pii_categories",
        "api_surface",
        "fragility_flags",
        "confidence",
      ],
    );
  });

  it("round-trips a delimited v1 report", () => {
    const report: ReadinessReportV1 = {
      summary: "Demo product",
      languages: "TypeScript",
      size: "small",
      structure: "monorepo",
      frontend: "Next.js",
      backend: "Fastify",
      database: "Postgres",
      tenancy: "single",
      auth: "session",
      authorization: "rbac",
      row_level_security: "none",
      environments: "prod,staging",
      deploys: "Vercel+Railway",
      tests: "node:test",
      background_jobs: "email worker",
      integrations: "Resend",
      secrets_pattern: "env+vault",
      logging: "structured",
      error_handling: "safeError",
      pii_categories: "email,name",
      api_surface: "/v1/*",
      fragility_flags: ["manual-migrate"],
      confidence: 0.8,
    };
    const doc = formatReadinessReportV1(report);
    assert.ok(doc.startsWith(READINESS_REPORT_V1_START));
    assert.ok(doc.endsWith(READINESS_REPORT_V1_END));
    const parsed = parseReadinessReportV1(doc);
    assert.ok(parsed);
    assert.equal(parsed!.summary, "Demo product");
    assert.equal(parsed!.confidence, 0.8);
    assert.deepEqual(parsed!.fragility_flags, ["manual-migrate"]);
  });
});

describe("readiness redaction helpers", () => {
  it("redacts connection strings and secrets from pastes", () => {
    const raw = [
      "DATABASE_URL=postgres://user:pass@host/db",
      "Authorization: Bearer super-secret-token-value",
      "sk_live_abc123def456ghi789",
      "normal text remains",
    ].join("\n");
    const redacted = redactSensitivePaste(raw);
    assert.ok(!redacted.includes("user:pass@host"));
    assert.ok(!redacted.includes("super-secret-token-value"));
    assert.ok(!redacted.includes("sk_live_abc123"));
    assert.ok(redacted.includes("normal text remains"));
    assert.ok(redacted.includes("[REDACTED]"));
  });

  it("generates non-empty high-entropy tokens", () => {
    const a = generateReadinessSessionToken();
    const b = generateReadinessSessionToken();
    assert.ok(a.length >= 16);
    assert.ok(b.length >= 16);
    assert.notEqual(a, b);
  });

  it("strips U+0000 from free-text so Postgres never 500s on draft ingest", () => {
    assert.equal(stripNullBytes("Inventory\u0000SaaS for retail"), "InventorySaaS for retail");
    assert.equal(stripNullBytes("clean"), "clean");

    const nested = stripNullBytesDeep({
      productDescription: "Inventory\u0000SaaS",
      manualAnswers: {
        summary: "A\u0000B",
        concerns: "fragility\u0000here",
      },
      report: { summary: "report\u0000sum" },
      // Non-NUL C0 must survive (BUG-5 isolation / prior green checks).
      note: "keep\u0001\u0002\u0007bell",
    });
    assert.deepEqual(nested, {
      productDescription: "InventorySaaS",
      manualAnswers: {
        summary: "AB",
        concerns: "fragilityhere",
      },
      report: { summary: "reportsum" },
      note: "keep\u0001\u0002\u0007bell",
    });

    const draft = redactSessionDraft({
      productDescription: "Inventory\u0000SaaS for retail",
      manualAnswers: { summary: "sum\u0000mary", concerns: "c\u0000oncerns" },
      report: { summary: "r\u0000eport" },
      stage: "confirm",
    });
    assert.equal(draft.productDescription, "InventorySaaS for retail");
    assert.equal((draft.manualAnswers as Record<string, string>).summary, "summary");
    assert.equal((draft.manualAnswers as Record<string, string>).concerns, "concerns");
    assert.equal((draft.report as Record<string, string>).summary, "report");
    assert.equal(JSON.stringify(draft).includes("\u0000"), false);
  });
});

describe("readiness routes without database", () => {
  let ctx: AppContext;
  let rateLimitStore: MemoryRateLimitStore;

  before(async () => {
    rateLimitStore = new MemoryRateLimitStore();
    ctx = await buildApp({
      env: loadApiEnv({
        NODE_ENV: "test",
        LOG_LEVEL: "silent",
        CORS_ORIGINS: "https://www.vygo.ai",
        // Waitlist IP limits must not gate readiness; readiness uses its own bucket.
        RATE_LIMIT_IP_MAX: "100",
        RATE_LIMIT_IP_WINDOW_SECONDS: "3600",
        IP_HASH_SALT: "test-salt-for-readiness",
      }),
      skipDatabase: true,
      skipInlineWorker: true,
      rateLimitStore,
    });
    await ctx.app.ready();
  });

  after(async () => {
    await ctx.close();
  });

  it("POST /v1/readiness/session returns 503 without database", async () => {
    rateLimitStore.clear();
    const res = await ctx.app.inject({
      method: "POST",
      url: "/v1/readiness/session",
      headers: { "content-type": "application/json" },
      payload: {},
    });
    assert.equal(res.statusCode, 503);
    const body = res.json() as { token?: string; error?: { code?: string } };
    assert.equal(body.token, undefined);
    assert.equal(body.error?.code, "UNAVAILABLE");
  });

  it("GET /v1/readiness/session/not-a-valid-token returns 4xx", async () => {
    rateLimitStore.clear();
    const res = await ctx.app.inject({
      method: "GET",
      url: "/v1/readiness/session/!!!",
    });
    assert.ok(res.statusCode >= 400 && res.statusCode < 500);
    const text = res.body;
    assert.ok(!/DATABASE_URL/i.test(text));
    assert.ok(!/postgres:\/\//i.test(text));
    assert.ok(!/stack/i.test(text));
  });

  it("GET clearly-invalid short token returns 400", async () => {
    rateLimitStore.clear();
    const res = await ctx.app.inject({
      method: "GET",
      url: "/v1/readiness/session/short",
    });
    assert.equal(res.statusCode, 400);
  });

  it("rate-limits rapid repeated create requests with 429", async () => {
    rateLimitStore.clear();
    let saw429 = false;
    let successes = 0;
    let retryAfter: number | null = null;
    for (let i = 0; i < 35; i += 1) {
      const res = await ctx.app.inject({
        method: "POST",
        url: "/v1/readiness/session",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.50",
        },
        payload: {},
      });
      if (res.statusCode === 429) {
        saw429 = true;
        const body = res.json() as { error?: { code?: string } };
        assert.equal(body.error?.code, "RATE_LIMITED");
        // Create budget should allow a normal multi-step flow (several ops headroom).
        assert.ok(successes >= 5, `expected headroom before 429, got ${successes}`);
        const raw = res.headers["retry-after"];
        retryAfter = typeof raw === "string" ? Number(raw) : Number(raw);
        // Short window — never a 1-hour hard lockout.
        assert.ok(
          Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter <= 120,
          `expected short Retry-After, got ${raw}`,
        );
        break;
      }
      if (res.statusCode === 503 || res.statusCode === 201) {
        successes += 1;
      }
    }
    assert.equal(saw429, true);
    assert.ok(retryAfter !== null);
  });

  it("multi-step create+GET+PATCH stays under the shared readiness budget", async () => {
    rateLimitStore.clear();
    const ip = "203.0.113.88";
    // Simulate a normal interactive session: create then several resume/save ops.
    for (let i = 0; i < 8; i += 1) {
      const create = await ctx.app.inject({
        method: "POST",
        url: "/v1/readiness/session",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": ip,
        },
        payload: {},
      });
      // Without DB this is 503, but must not be 429 for ordinary multi-step use.
      assert.notEqual(create.statusCode, 429, `create #${i} should not be rate limited`);
      assert.ok(create.statusCode === 503 || create.statusCode === 201);

      const get = await ctx.app.inject({
        method: "GET",
        url: "/v1/readiness/session/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        headers: { "x-forwarded-for": ip },
      });
      assert.notEqual(get.statusCode, 429, `get #${i} should not be rate limited`);
    }
  });

  it("waitlist-style IP limits do not gate readiness session create", async () => {
    rateLimitStore.clear();
    // Even with a tight waitlist IP budget configured, readiness uses its own key.
    const create = await ctx.app.inject({
      method: "POST",
      url: "/v1/readiness/session",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.77",
      },
      payload: {},
    });
    assert.notEqual(create.statusCode, 429);
    assert.ok(create.statusCode === 503 || create.statusCode === 201);
  });

  it("POST /v1/readiness/score is registered (not 404) and rejects missing gate fields", async () => {
    rateLimitStore.clear();
    const res = await ctx.app.inject({
      method: "POST",
      url: "/v1/readiness/score",
      headers: { "content-type": "application/json" },
      payload: {
        token: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        // intentionally omit name, email, privacy consent
        turnstileToken: "XXXX",
      },
    });
    // Must not be Fastify's unregistered-route 404.
    assert.notEqual(res.statusCode, 404);
    assert.equal(res.statusCode, 400);
    const body = res.json() as {
      error?: { code?: string; fields?: Record<string, string> };
      scores?: unknown;
      dimensions?: unknown;
      snapshotId?: string;
    };
    assert.equal(body.error?.code, "VALIDATION_ERROR");
    assert.ok(
      body.error?.fields?.name || body.error?.fields?.email || body.error?.fields?.privacyAccepted,
    );
    // No scored results when gate is incomplete.
    assert.equal(body.scores, undefined);
    assert.equal(body.dimensions, undefined);
    assert.equal(body.snapshotId, undefined);
  });

  it("POST /v1/readiness/score-preview scores two answer sets without Turnstile or DB", async () => {
    rateLimitStore.clear();

    const missing = await ctx.app.inject({
      method: "POST",
      url: "/v1/readiness/score-preview",
      headers: { "content-type": "application/json" },
      payload: {},
    });
    assert.equal(missing.statusCode, 400);
    assert.equal((missing.json() as { error?: { code?: string } }).error?.code, "VALIDATION_ERROR");

    const weakRes = await ctx.app.inject({
      method: "POST",
      url: "/v1/readiness/score-preview",
      headers: { "content-type": "application/json" },
      payload: { profile: "weak" },
    });
    assert.equal(weakRes.statusCode, 200);
    const weak = weakRes.json() as {
      preview?: boolean;
      dryRun?: boolean;
      persisted?: boolean;
      leadCreated?: boolean;
      turnstileRequired?: boolean;
      overall?: number;
      dimensionResults?: Array<{
        dimension: string;
        score: number;
        sub_metrics: Array<{
          name: string;
          score: number;
          weight: number;
          evidence: { question_id: string; answer_value: unknown; reason: string };
        }>;
      }>;
    };
    assert.equal(weak.preview, true);
    assert.equal(weak.dryRun, true);
    assert.equal(weak.persisted, false);
    assert.equal(weak.leadCreated, false);
    assert.equal(weak.turnstileRequired, false);
    assert.ok(Array.isArray(weak.dimensionResults));
    assert.equal(weak.dimensionResults!.length, 5);

    const strongRes = await ctx.app.inject({
      method: "POST",
      url: "/v1/readiness/score-preview",
      headers: { "content-type": "application/json" },
      payload: { profile: "strong" },
    });
    assert.equal(strongRes.statusCode, 200);
    const strong = strongRes.json() as {
      overall?: number;
      dimensionResults?: Array<{
        dimension: string;
        score: number;
        sub_metrics: Array<{
          name: string;
          score: number;
          weight: number;
          evidence: { question_id: string; answer_value: unknown; reason: string };
        }>;
      }>;
    };

    // (a) dimension scores differ across answer sets
    let anyDimDiffers = false;
    for (let i = 0; i < weak.dimensionResults!.length; i += 1) {
      if (weak.dimensionResults![i]!.score !== strong.dimensionResults![i]!.score) {
        anyDimDiffers = true;
      }
    }
    assert.ok(anyDimDiffers, "weak vs strong profiles must produce different dimension scores");

    // (b) within each payload not all dimensions share the same score
    const weakScores = weak.dimensionResults!.map((d) => d.score);
    const strongScores = strong.dimensionResults!.map((d) => d.score);
    assert.ok(new Set(weakScores).size > 1);
    assert.ok(new Set(strongScores).size > 1);

    // (c) not pinned at 25 for both
    assert.ok(!(weakScores.every((s) => s === 25) && strongScores.every((s) => s === 25)));

    // (d)(e) sub_metrics + evidence shape
    for (const dim of weak.dimensionResults!) {
      assert.ok(dim.sub_metrics.length >= 4 && dim.sub_metrics.length <= 6);
      for (const sm of dim.sub_metrics) {
        assert.ok(sm.name.length > 0);
        assert.equal(typeof sm.score, "number");
        assert.equal(typeof sm.weight, "number");
        assert.ok(sm.evidence.question_id.length > 0);
        assert.ok(sm.evidence.answer_value != null && sm.evidence.answer_value !== "");
        assert.ok(sm.evidence.reason.length > 10);
        assert.notEqual(sm.evidence.reason, "N/A");
      }
    }

    // Custom answers path (not just named profiles)
    const custom = await ctx.app.inject({
      method: "POST",
      url: "/v1/readiness/score-preview",
      headers: { "content-type": "application/json" },
      payload: {
        answers: {
          auth: "none — shared password only",
          tests: "none",
          secrets_pattern: "hardcoded in git",
          deploys: "manual ssh",
        },
      },
    });
    assert.equal(custom.statusCode, 200);
    const customBody = custom.json() as { dimensionResults?: unknown[]; overall?: number };
    assert.ok(Array.isArray(customBody.dimensionResults));
    assert.equal(typeof customBody.overall, "number");
  });

  it("GET /v1/readiness/snapshot/:id is registered and validates id shape", async () => {
    rateLimitStore.clear();
    const res = await ctx.app.inject({
      method: "GET",
      url: "/v1/readiness/snapshot/not-a-uuid",
    });
    assert.notEqual(res.statusCode, 404);
    assert.equal(res.statusCode, 400);
    const body = res.json() as { error?: { code?: string } };
    assert.equal(body.error?.code, "BAD_REQUEST");
  });

  it("GET /v1/readiness/snapshot/:id serves seeded E2E fixtures with real evidence", async () => {
    rateLimitStore.clear();
    const mixedId = "00000000-0000-4000-a000-0000000000e3";
    const res = await ctx.app.inject({
      method: "GET",
      url: `/v1/readiness/snapshot/${mixedId}`,
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as {
      id?: string;
      e2eFixture?: boolean;
      e2eProfile?: string;
      overall?: number;
      dimensionResults?: Array<{
        dimension: string;
        score: number;
        sub_metrics: Array<{
          name: string;
          score: number;
          evidence: { question_id: string; answer_value: unknown; reason: string };
        }>;
      }>;
    };
    assert.equal(body.id, mixedId);
    assert.equal(body.e2eFixture, true);
    assert.equal(body.e2eProfile, "mixed");
    assert.equal(typeof body.overall, "number");
    assert.ok(Array.isArray(body.dimensionResults));
    assert.equal(body.dimensionResults!.length, 5);
    for (const dim of body.dimensionResults!) {
      assert.ok(dim.sub_metrics.length >= 1);
      for (const sm of dim.sub_metrics) {
        assert.ok(sm.evidence.question_id.length > 0);
        assert.ok(sm.evidence.reason.length > 10);
        assert.ok(sm.evidence.answer_value != null && sm.evidence.answer_value !== "");
        const reasonLower = sm.evidence.reason.toLowerCase();
        assert.equal(reasonLower.includes("lorem"), false);
        assert.equal(reasonLower.includes("placeholder"), false);
        assert.equal(reasonLower.includes("todo"), false);
      }
    }
  });

  it("POST /v1/readiness/score-e2e scores mixed profile without Turnstile", async () => {
    rateLimitStore.clear();
    const res = await ctx.app.inject({
      method: "POST",
      url: "/v1/readiness/score-e2e",
      headers: { "content-type": "application/json" },
      payload: { profile: "mixed" },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as {
      snapshotId?: string;
      e2eFixture?: boolean;
      turnstileRequired?: boolean;
      dimensionResults?: Array<{
        sub_metrics: Array<{ evidence: { reason: string; answer_value: unknown } }>;
      }>;
      snapshotPath?: string;
    };
    assert.equal(body.e2eFixture, true);
    assert.equal(body.turnstileRequired, false);
    assert.equal(body.snapshotId, "00000000-0000-4000-a000-0000000000e3");
    assert.ok(body.snapshotPath?.includes(body.snapshotId!));
    assert.ok((body.dimensionResults?.length ?? 0) >= 5);
  });

  it("POST /v1/readiness/score rejects dummy token without E2E flag even with e2e email", async () => {
    rateLimitStore.clear();
    const res = await ctx.app.inject({
      method: "POST",
      url: "/v1/readiness/score",
      headers: { "content-type": "application/json" },
      payload: {
        token: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        name: "Ratchet E2E Test",
        email: "e2e-test+noflag@vygo.ai",
        privacyAccepted: true,
        turnstileToken: "XXXX.DUMMY.TOKEN.XXXX",
      },
    });
    // Without readinessE2E flag, real Turnstile verifier runs (test env uses always-pass secret
    // or reject DI). Either way we must not accept incomplete sessions as success with scores
    // when token is dummy AND production-style verifier rejects — inject uses PassThrough or real.
    // In this suite Turnstile is often always-pass; assert we never return a snapshot without a session.
    assert.notEqual(res.statusCode, 200);
    const body = res.json() as { error?: { code?: string }; snapshotId?: string };
    assert.equal(body.snapshotId, undefined);
    assert.ok(body.error?.code);
  });
});
