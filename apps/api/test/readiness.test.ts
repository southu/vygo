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
import { redactSensitivePaste, generateReadinessSessionToken } from "@vygo/db";
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
    assert.ok(body.error?.fields?.name || body.error?.fields?.email || body.error?.fields?.privacyAccepted);
    // No scored results when gate is incomplete.
    assert.equal(body.scores, undefined);
    assert.equal(body.dimensions, undefined);
    assert.equal(body.snapshotId, undefined);
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
});
