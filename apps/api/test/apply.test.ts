/**
 * Database-free tests for apply-form validation and route registration.
 * Persistence is covered live via POST /api/apply + GET /api/apply/:id.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadApiEnv } from "@vygo/config";
import { buildApp, type AppContext } from "../src/app.js";
import { isPlausibleWorkEmail, parseApplyBody } from "../src/routes/apply.js";

describe("apply validation", () => {
  it("accepts plausible work emails", () => {
    assert.equal(isPlausibleWorkEmail("ratchet-tester@example.com"), true);
  });

  it("rejects implausible work emails", () => {
    assert.equal(isPlausibleWorkEmail("not-an-email"), false);
    assert.equal(isPlausibleWorkEmail("missing-domain@"), false);
    assert.equal(isPlausibleWorkEmail("local@nodot"), false);
  });

  it("requires non-empty full_name", () => {
    const result = parseApplyBody({
      full_name: "  ",
      work_email: "ratchet-tester@example.com",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 400);
      assert.equal(result.error.error.code, "VALIDATION_ERROR");
    }
  });

  it("rejects implausible work_email", () => {
    const result = parseApplyBody({
      full_name: "Ratchet Tester",
      work_email: "not-an-email",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 400);
    }
  });

  it("accepts guide_updates with email and sets source explicitly", () => {
    const result = parseApplyBody({
      source: "guide_updates",
      email: "  Guide.User@Example.COM ",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.isGuideUpdates, true);
      assert.equal(result.value.source, "guide_updates");
      assert.equal(result.value.workEmail, "guide.user@example.com");
      assert.equal(result.value.fullName, "Guide updates");
    }
  });

  it("rejects guide_updates with invalid email", () => {
    const result = parseApplyBody({
      source: "guide_updates",
      email: "not-an-email",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 400);
    }
  });
});

describe("apply routes without database", () => {
  let ctx: AppContext;

  before(async () => {
    ctx = await buildApp({
      env: loadApiEnv({
        NODE_ENV: "test",
        LOG_LEVEL: "silent",
        CORS_ORIGINS: "https://www.vygo.ai",
      }),
      skipDatabase: true,
      skipInlineWorker: true,
    });
    await ctx.app.ready();
  });

  after(async () => {
    await ctx.close();
  });

  it("POST /api/apply returns 400 for empty full_name and no id", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/apply",
      headers: {
        "content-type": "application/json",
        origin: "https://www.vygo.ai",
      },
      payload: {
        full_name: "",
        work_email: "ratchet-tester@example.com",
      },
    });
    assert.equal(res.statusCode, 400);
    const body = res.json() as { id?: string; error?: { code?: string } };
    assert.equal(body.id, undefined);
    assert.equal(body.error?.code, "VALIDATION_ERROR");
  });

  it("POST /api/apply returns 400 for implausible email and no id", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/apply",
      headers: {
        "content-type": "application/json",
        origin: "https://www.vygo.ai",
      },
      payload: {
        full_name: "Ratchet Tester",
        work_email: "not-an-email",
      },
    });
    assert.equal(res.statusCode, 400);
    const body = res.json() as { id?: string };
    assert.equal(body.id, undefined);
  });

  it("POST /api/apply returns 503 when database is unavailable (valid body)", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/apply",
      headers: {
        "content-type": "application/json",
        origin: "https://www.vygo.ai",
      },
      payload: {
        full_name: "Ratchet Tester",
        work_email: "ratchet-tester@example.com",
      },
    });
    assert.equal(res.statusCode, 503);
    const body = res.json() as { id?: string; error?: { code?: string } };
    assert.equal(body.id, undefined);
    assert.equal(body.error?.code, "UNAVAILABLE");
  });

  it("POST /api/apply guide_updates returns 4xx for invalid email without secrets", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/apply",
      headers: {
        "content-type": "application/json",
        origin: "https://www.vygo.ai",
      },
      payload: {
        source: "guide_updates",
        email: "not-an-email",
      },
    });
    assert.equal(res.statusCode, 400);
    const raw = res.body;
    assert.equal(/traceback/i.test(raw), false);
    assert.equal(/postgres/i.test(raw), false);
    assert.equal(raw.includes("not-an-email"), false);
    const body = res.json() as { id?: string; error?: { code?: string } };
    assert.equal(body.id, undefined);
    assert.equal(body.error?.code, "VALIDATION_ERROR");
  });

  it("POST /api/apply guide_updates returns 4xx for empty email without row id", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/apply",
      headers: {
        "content-type": "application/json",
        origin: "https://www.vygo.ai",
      },
      payload: {
        source: "guide_updates",
        email: "",
      },
    });
    assert.equal(res.statusCode, 400);
    const body = res.json() as { id?: string };
    assert.equal(body.id, undefined);
  });

  it("POST /api/apply guide_updates returns 4xx for empty body object", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/apply",
      headers: {
        "content-type": "application/json",
        origin: "https://www.vygo.ai",
      },
      payload: {},
    });
    assert.ok(res.statusCode >= 400 && res.statusCode < 500);
    assert.ok(res.statusCode < 500);
  });

  it("POST /api/apply guide_updates with valid email returns 503 without DB (validation passed, no secrets)", async () => {
    const email = "ratchet-qa+guide-nodb@example.com";
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/apply",
      headers: {
        "content-type": "application/json",
        origin: "https://www.vygo.ai",
      },
      payload: {
        source: "guide_updates",
        email,
      },
    });
    // No database in this suite — must not 500 with stack, must not echo email.
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.includes(email), false);
    assert.equal(/traceback|postgres:\/\//i.test(res.body), false);
  });

  it("Turnstile: missing token is not rejected for guide_updates or apply (same status family)", async () => {
    // Without DB both get 503 after validation — proves turnstile is not a gate.
    const guide = await ctx.app.inject({
      method: "POST",
      url: "/api/apply",
      headers: {
        "content-type": "application/json",
        origin: "https://www.vygo.ai",
      },
      payload: {
        source: "guide_updates",
        email: "ratchet-qa+ts-miss-guide@example.com",
        full_name: "Guide updates",
        message: "guide updates opt-in",
      },
    });
    const apply = await ctx.app.inject({
      method: "POST",
      url: "/api/apply",
      headers: {
        "content-type": "application/json",
        origin: "https://www.vygo.ai",
      },
      payload: {
        full_name: "Ratchet QA",
        work_email: "ratchet-qa+ts-miss-apply@example.com",
        message: "test",
      },
    });
    assert.equal(guide.statusCode, apply.statusCode);
    assert.equal(guide.statusCode, 503);
    assert.equal(/TURNSTILE/i.test(guide.body), false);
    assert.equal(/TURNSTILE/i.test(apply.body), false);
    assert.equal(guide.json().error?.code, apply.json().error?.code);
  });

  it("Turnstile: invalid token is not rejected for guide_updates or apply (same status/shape)", async () => {
    const invalidToken = "invalid-ratchet-token";
    const guide = await ctx.app.inject({
      method: "POST",
      url: "/api/apply",
      headers: {
        "content-type": "application/json",
        origin: "https://www.vygo.ai",
      },
      payload: {
        source: "guide_updates",
        email: "ratchet-qa+ts-bad-guide@example.com",
        full_name: "Guide updates",
        message: "guide updates opt-in",
        turnstileToken: invalidToken,
      },
    });
    const apply = await ctx.app.inject({
      method: "POST",
      url: "/api/apply",
      headers: {
        "content-type": "application/json",
        origin: "https://www.vygo.ai",
      },
      payload: {
        full_name: "Ratchet QA",
        work_email: "ratchet-qa+ts-bad-apply@example.com",
        message: "test",
        turnstileToken: invalidToken,
      },
    });
    assert.equal(guide.statusCode, apply.statusCode);
    assert.equal(guide.statusCode, 503);
    // Identical error shape when DB is unavailable — Turnstile did not diverge the path.
    assert.deepEqual(guide.json(), apply.json());
    assert.equal(guide.body.includes(invalidToken), false);
    assert.equal(apply.body.includes(invalidToken), false);
  });

  it("non-POST methods on /api/apply are rejected (no stack)", async () => {
    for (const method of ["GET", "PUT", "DELETE", "PATCH"] as const) {
      const res = await ctx.app.inject({
        method,
        url: "/api/apply",
        headers: { origin: "https://www.vygo.ai" },
      });
      // Fastify returns 404 for unregistered methods on this path, or 405 if set.
      assert.ok(res.statusCode >= 400 && res.statusCode < 500, method);
      assert.equal(/traceback/i.test(res.body), false);
    }
  });

  it("GET /api/apply/:id returns 400 for non-uuid", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/apply/not-a-uuid",
    });
    assert.equal(res.statusCode, 400);
  });
});
