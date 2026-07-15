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

  it("GET /api/apply/:id returns 400 for non-uuid", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/apply/not-a-uuid",
    });
    assert.equal(res.statusCode, 400);
  });
});
