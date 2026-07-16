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

  it("rate-limits rapid repeated requests with 429", async () => {
    rateLimitStore.clear();
    let saw429 = false;
    for (let i = 0; i < 30; i += 1) {
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
        break;
      }
    }
    assert.equal(saw429, true);
  });
});
