/**
 * Integration tests against a freshly migrated PostgreSQL database.
 *
 * Requires DATABASE_URL (defaults to local vygo_test).
 */
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createDatabase,
  runMigrations,
  setSiteAvailability,
  getSiteAvailability,
  seedLocalAvailability,
  toPublicAvailability,
  NEUTRAL_PUBLIC_AVAILABILITY,
  computeAvailabilityEtag,
  type DatabaseHandle,
} from "@vygo/db";
import { loadApiEnv } from "@vygo/config";
import { publicAvailabilitySchema } from "@vygo/validation";
import { buildApp, type AppContext } from "../src/app.js";
import { AVAILABILITY_CACHE_CONTROL } from "../src/routes/availability.js";

const TEST_DATABASE_URL =
  process.env.DATABASE_URL_TEST ||
  process.env.DATABASE_URL ||
  "postgresql://vygo:vygo@localhost:5432/vygo_test";

let handle: DatabaseHandle;
let ctx: AppContext;

async function resetAvailability(): Promise<void> {
  await handle.sql`DELETE FROM site_availability`;
}

before(async () => {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.CORS_ORIGINS = "http://allowed.example,http://127.0.0.1:3000";
  process.env.LOG_LEVEL = "silent";
  process.env.NODE_ENV = "test";

  await runMigrations(TEST_DATABASE_URL);
  handle = createDatabase(TEST_DATABASE_URL);
  ctx = await buildApp({
    env: loadApiEnv({
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
      CORS_ORIGINS: "http://allowed.example,http://127.0.0.1:3000",
      LOG_LEVEL: "silent",
      NODE_ENV: "test",
      BODY_LIMIT_BYTES: String(64 * 1024),
    }),
    database: handle,
  });
  await ctx.app.ready();
});

after(async () => {
  await ctx.close();
  await handle.close();
});

beforeEach(async () => {
  await resetAvailability();
});

describe("migrations + readiness", () => {
  it("reports ready when migrations and schema are present", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/readyz" });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.ready, true);
    assert.equal(body.database, "ok");
    assert.equal(body.migrations, "ok");
  });

  it("healthz is process-only liveness", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/healthz" });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.ok, true);
    assert.equal(body.healthy, true);
  });
});

describe("GET /v1/public/availability", () => {
  it("returns open state with public fields only", async () => {
    await setSiteAvailability(handle.db, {
      status: "open",
      nextOpeningDate: "2099-01-15",
      engagementType: "launch",
      displayNote: "Accepting new engagements",
      availableStarts: 2,
      updatedBy: "tester@internal.example",
    });

    const res = await ctx.app.inject({ method: "GET", url: "/v1/public/availability" });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    const parsed = publicAvailabilitySchema.safeParse(body.data);
    assert.equal(parsed.success, true);
    assert.equal(body.data.status, "open");
    assert.equal(body.data.nextOpeningDate, "2099-01-15");
    assert.equal(body.data.engagementType, "launch");
    assert.equal(body.data.availableStarts, 2);

    const raw = res.body;
    assert.equal(raw.includes("tester@internal.example"), false);
    assert.equal(raw.includes("updatedBy"), false);
    assert.equal(raw.includes("updated_by"), false);
    assert.ok(!("id" in body.data));
  });

  it("returns waitlist and paused states", async () => {
    await setSiteAvailability(handle.db, {
      status: "waitlist",
      nextOpeningDate: "2099-06-01",
      engagementType: "audit",
      displayNote: "Join the waitlist",
      updatedBy: "ops",
    });
    let res = await ctx.app.inject({ method: "GET", url: "/v1/public/availability" });
    assert.equal(res.json().data.status, "waitlist");

    await setSiteAvailability(handle.db, {
      status: "paused",
      nextOpeningDate: null,
      engagementType: "general",
      displayNote: "Temporarily paused",
      updatedBy: "ops",
    });
    res = await ctx.app.inject({ method: "GET", url: "/v1/public/availability" });
    assert.equal(res.json().data.status, "paused");
  });

  it("includes Cache-Control, ETag, and related caching headers", async () => {
    await setSiteAvailability(handle.db, {
      status: "open",
      nextOpeningDate: "2099-03-01",
      updatedBy: "ops",
    });
    const res = await ctx.app.inject({ method: "GET", url: "/v1/public/availability" });
    assert.equal(res.headers["cache-control"], AVAILABILITY_CACHE_CONTROL);
    assert.ok(typeof res.headers.etag === "string" && res.headers.etag.length > 2);
    assert.ok(
      String(res.headers.vary || "")
        .toLowerCase()
        .includes("origin"),
    );
  });

  it("returns 304 with empty body when If-None-Match matches ETag", async () => {
    await setSiteAvailability(handle.db, {
      status: "open",
      nextOpeningDate: "2099-04-01",
      updatedBy: "ops",
    });
    const first = await ctx.app.inject({ method: "GET", url: "/v1/public/availability" });
    const etag = first.headers.etag;
    assert.ok(etag);

    const second = await ctx.app.inject({
      method: "GET",
      url: "/v1/public/availability",
      headers: { "if-none-match": String(etag) },
    });
    assert.equal(second.statusCode, 304);
    assert.equal(second.body, "");
  });

  it("stale effective date degrades to neutral safe response", async () => {
    await setSiteAvailability(handle.db, {
      status: "waitlist",
      nextOpeningDate: "2020-01-01",
      engagementType: "audit",
      displayNote: "Should not be shown as scarcity",
      updatedBy: "ops",
    });
    const res = await ctx.app.inject({ method: "GET", url: "/v1/public/availability" });
    assert.equal(res.statusCode, 200);
    const data = res.json().data;
    assert.equal(data.status, "open");
    assert.notEqual(data.status, "waitlist");
    assert.notEqual(data.status, "paused");
    assert.equal(data.nextOpeningDate, null);
    assert.equal(data.displayNote, "Request current availability");
  });

  it("missing availability data returns neutral safe response (not 500)", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/v1/public/availability" });
    assert.equal(res.statusCode, 200);
    const data = res.json().data;
    assert.equal(data.status, NEUTRAL_PUBLIC_AVAILABILITY.status);
    assert.equal(data.displayNote, NEUTRAL_PUBLIC_AVAILABILITY.displayNote);
    assert.notEqual(data.status, "waitlist");
    assert.notEqual(data.status, "paused");
  });
});

describe("request limits, CORS, request ids, safe errors", () => {
  it("rejects oversized payloads with 413 and safe error body", async () => {
    const big = "x".repeat(70 * 1024);
    const res = await ctx.app.inject({
      method: "POST",
      url: "/v1/waitlist",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ pad: big }),
    });
    assert.equal(res.statusCode, 413);
    const body = res.json();
    assert.equal(body.error.code, "PAYLOAD_TOO_LARGE");
    const lower = res.body.toLowerCase();
    assert.equal(lower.includes("stack"), false);
    assert.equal(lower.includes("select "), false);
    assert.equal(lower.includes("@"), false);
  });

  it("allows configured Origin and withholds ACAO for unconfigured Origin", async () => {
    const allowed = await ctx.app.inject({
      method: "GET",
      url: "/healthz",
      headers: { origin: "http://allowed.example" },
    });
    assert.equal(allowed.headers["access-control-allow-origin"], "http://allowed.example");

    const denied = await ctx.app.inject({
      method: "GET",
      url: "/healthz",
      headers: { origin: "http://evil.example" },
    });
    assert.equal(denied.headers["access-control-allow-origin"], undefined);
  });

  it("allows the production marketing origin and a vygo Vercel preview origin, never a wildcard", async () => {
    const prod = await ctx.app.inject({
      method: "OPTIONS",
      url: "/healthz",
      headers: { origin: "https://www.vygo.ai", "access-control-request-method": "GET" },
    });
    assert.equal(prod.headers["access-control-allow-origin"], "https://www.vygo.ai");

    const preview = await ctx.app.inject({
      method: "OPTIONS",
      url: "/healthz",
      headers: {
        origin: "https://vygo-git-main-southu.vercel.app",
        "access-control-request-method": "GET",
      },
    });
    assert.equal(
      preview.headers["access-control-allow-origin"],
      "https://vygo-git-main-southu.vercel.app",
    );

    const unrelated = await ctx.app.inject({
      method: "OPTIONS",
      url: "/healthz",
      headers: {
        origin: "https://unrelated.vercel.app",
        "access-control-request-method": "GET",
      },
    });
    // Non-vygo *.vercel.app is unrelated: no reflected origin, and never `*`.
    assert.equal(unrelated.headers["access-control-allow-origin"], undefined);
    assert.notEqual(prod.headers["access-control-allow-origin"], "*");
  });

  it("propagates valid inbound request ids and generates otherwise", async () => {
    const prop = await ctx.app.inject({
      method: "GET",
      url: "/healthz",
      headers: { "x-request-id": "test-req-12345" },
    });
    assert.equal(prop.headers["x-request-id"], "test-req-12345");

    const gen = await ctx.app.inject({ method: "GET", url: "/healthz" });
    assert.ok(typeof gen.headers["x-request-id"] === "string");
    assert.ok(String(gen.headers["x-request-id"]).length > 0);
  });

  it("public error responses contain no stack, SQL, credentials, or emails", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/definitely-missing-route-xyz",
    });
    assert.equal(res.statusCode, 404);
    const lower = res.body.toLowerCase();
    assert.equal(lower.includes("at "), false);
    assert.equal(lower.includes("select "), false);
    assert.equal(lower.includes("password"), false);
    assert.equal(lower.includes("@"), false);
  });
});

describe("singleton + seed + etag helpers", () => {
  it("enforces at most one active availability record", async () => {
    await setSiteAvailability(handle.db, {
      status: "open",
      nextOpeningDate: "2099-01-01",
      updatedBy: "a",
    });
    await setSiteAvailability(handle.db, {
      status: "waitlist",
      nextOpeningDate: "2099-02-01",
      updatedBy: "b",
    });
    const rows = await handle.sql`SELECT count(*)::int AS c FROM site_availability`;
    assert.equal(rows[0]?.c, 1);
    const current = await getSiteAvailability(handle.db);
    assert.equal(current?.status, "waitlist");
    assert.equal(current?.updatedBy, "b");
  });

  it("seedLocalAvailability is repeatable", async () => {
    const first = await seedLocalAvailability(handle.db);
    const second = await seedLocalAvailability(handle.db);
    assert.equal(first.id, "main");
    assert.equal(second.id, "main");
    const rows = await handle.sql`SELECT count(*)::int AS c FROM site_availability`;
    assert.equal(rows[0]?.c, 1);
    const pub = toPublicAvailability(second);
    assert.ok(pub.status === "waitlist" || pub.status === "open");
  });

  it("ETag is deterministic for the same public payload", () => {
    const a = computeAvailabilityEtag(NEUTRAL_PUBLIC_AVAILABILITY);
    const b = computeAvailabilityEtag({ ...NEUTRAL_PUBLIC_AVAILABILITY });
    assert.equal(a, b);
  });
});
