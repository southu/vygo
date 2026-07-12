/**
 * Waitlist intake integration tests (Postgres + in-memory rate limit + Turnstile DI).
 */
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  countOutboxForEntry,
  createDatabase,
  findWaitlistByEmail,
  persistWaitlistIntake,
  runMigrations,
  type DatabaseHandle,
} from "@vygo/db";
import { CLOUDFLARE_TURNSTILE_TEST_SECRETS, loadApiEnv } from "@vygo/config";
import { buildApp, type AppContext } from "../src/app.js";
import { MemoryRateLimitStore } from "../src/services/rate-limit.js";
import {
  CloudflareTurnstileVerifier,
  PassThroughTurnstileVerifier,
  RejectTurnstileVerifier,
} from "../src/services/turnstile.js";
import { computeLeadScore } from "../src/services/scoring.js";
import { hashIpAddress, isVersionedIpHash, looksLikeRawIp } from "../src/services/ip-hash.js";
import { UTM_MAX_LENGTH } from "@vygo/validation";

const TEST_DATABASE_URL =
  process.env.DATABASE_URL_TEST ||
  process.env.DATABASE_URL ||
  "postgresql://vygo:vygo@localhost:5432/vygo_test";

const ORIGIN = "http://allowed.example";
const TURNSTILE_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

let handle: DatabaseHandle;
let ctx: AppContext;
let rateLimitStore: MemoryRateLimitStore;

function envOverrides(extra: Record<string, string> = {}) {
  return loadApiEnv({
    ...process.env,
    DATABASE_URL: TEST_DATABASE_URL,
    CORS_ORIGINS: "http://allowed.example,http://127.0.0.1:3000,http://127.0.0.1:8380",
    LOG_LEVEL: "silent",
    NODE_ENV: "test",
    BODY_LIMIT_BYTES: String(64 * 1024),
    TURNSTILE_SECRET_KEY: CLOUDFLARE_TURNSTILE_TEST_SECRETS.alwaysPasses,
    IP_HASH_SALT: "test-ip-salt-primary-value",
    IP_HASH_SALT_VERSION: "1",
    IP_HASH_SALT_PREVIOUS: "test-ip-salt-previous-value",
    IP_HASH_SALT_PREVIOUS_VERSION: "1",
    RATE_LIMIT_IP_MAX: "100",
    RATE_LIMIT_EMAIL_MAX: "100",
    MIN_FORM_COMPLETION_MS: "50",
    ENABLE_TEST_SURFACE: "true",
    TEST_FAULT_MODE: "none",
    INLINE_EMAIL_WORKER: "false",
    ...extra,
  });
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    fullName: "  Jordan Lee  ",
    email: "  Jordan.Lee+Tag@Example.COM ",
    companyName: "Example Labs",
    role: "Founder",
    productUrl: "https://example.com/app",
    prototypePlatform: "lovable",
    stage: "live_users",
    primaryBlocker: "security_compliance",
    desiredStartWindow: "within_30_days",
    budgetRange: "75k_150k",
    commercialDeadline: true,
    message: "An enterprise customer is waiting on SSO and audit logs.",
    privacyAccepted: true,
    marketingConsent: false,
    turnstileToken: TURNSTILE_TOKEN,
    idempotencyKey: randomUUID(),
    utm: {
      source: "linkedin",
      medium: "social",
      campaign: "prototype_teardown",
      content: null,
      term: null,
    },
    landingPage: "/waitlist",
    referrer: "https://www.linkedin.com/",
    formStartedAt: Date.now() - 5000,
    ...overrides,
  };
}

async function postWaitlist(payload: unknown, headers: Record<string, string> = {}) {
  return ctx.app.inject({
    method: "POST",
    url: "/v1/waitlist",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      "x-forwarded-for": headers["x-forwarded-for"] ?? "203.0.113.50",
      ...headers,
    },
    payload: payload as Record<string, unknown>,
  });
}

async function resetWaitlistTables(): Promise<void> {
  await handle.sql`DELETE FROM email_outbox`;
  await handle.sql`DELETE FROM submission_idempotency`;
  await handle.sql`DELETE FROM waitlist_entries`;
  rateLimitStore.clear();
}

before(async () => {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.LOG_LEVEL = "silent";
  process.env.NODE_ENV = "test";

  await runMigrations(TEST_DATABASE_URL);
  handle = createDatabase(TEST_DATABASE_URL);
  rateLimitStore = new MemoryRateLimitStore();
  ctx = await buildApp({
    env: envOverrides(),
    database: handle,
    rateLimitStore,
    turnstile: new CloudflareTurnstileVerifier(CLOUDFLARE_TURNSTILE_TEST_SECRETS.alwaysPasses),
  });
  await ctx.app.ready();
});

after(async () => {
  await ctx.close();
  await handle.close();
});

beforeEach(async () => {
  await resetWaitlistTables();
});

describe("POST /v1/waitlist — valid intake + normalization", () => {
  it("accepts a valid consented submission with generic success body", async () => {
    const payload = validPayload();
    const res = await postWaitlist(payload);
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.data.accepted, true);
    assert.equal(typeof body.data.message, "string");
    assert.equal(res.body.includes("Jordan"), false);
    assert.equal(res.body.toLowerCase().includes("example.com"), false);
    assert.equal(res.body.includes(TURNSTILE_TOKEN), false);
    assert.equal(res.body.includes("203.0.113"), false);
  });

  it("normalizes email case/whitespace and fullName trim without echoing email", async () => {
    const payload = validPayload({
      email: "  Mixed.Case+x@Example.ORG ",
      fullName: "  Ada Lovelace  ",
    });
    const res = await postWaitlist(payload);
    assert.equal(res.statusCode, 200);
    const entry = await findWaitlistByEmail(handle.db, "mixed.case+x@example.org");
    assert.ok(entry);
    assert.equal(entry.email, "mixed.case+x@example.org");
    assert.equal(entry.fullName, "Ada Lovelace");
    assert.equal(res.body.toLowerCase().includes("mixed.case"), false);
  });

  it("creates applicant + internal lead outbox jobs for a new intake", async () => {
    const email = `outbox-${randomUUID().slice(0, 8)}@example.com`;
    const res = await postWaitlist(validPayload({ email }));
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(typeof body.data.applicationId, "string");
    const entry = await findWaitlistByEmail(handle.db, email);
    assert.ok(entry);
    const count = await countOutboxForEntry(handle.db, entry.id);
    assert.equal(count, 2);
    const rows = await handle.sql`
      SELECT status, kind, idempotency_key FROM email_outbox WHERE waitlist_entry_id = ${entry.id}
    `;
    const kinds = new Set(rows.map((r) => r.kind));
    assert.ok(kinds.has("applicant_confirmation"));
    assert.ok(kinds.has("internal_lead_notification"));
    assert.ok(rows.every((r) => r.status === "pending"));
    assert.ok(rows.every((r) => String(r.idempotency_key).length > 0));
  });
});

describe("POST /v1/waitlist — validation and controls", () => {
  it("rejects malformed email and invalid field types with PII-safe errors", async () => {
    const res = await postWaitlist(validPayload({ email: "not-an-email" }));
    assert.equal(res.statusCode, 400);
    const body = res.json();
    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.equal(res.body.includes("not-an-email"), false);
  });

  it("rejects unknown forbidden fields", async () => {
    const res = await postWaitlist({ ...validPayload(), unexpectedField: "x" });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error.code, "VALIDATION_ERROR");
  });

  it("rejects over-limit fields", async () => {
    const res = await postWaitlist(validPayload({ fullName: "x".repeat(200) }));
    assert.equal(res.statusCode, 400);
    const body = res.json();
    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.equal(body.error.fields?.fullName, "Value exceeds the maximum allowed length.");
  });

  it("rejects control characters (NUL/C0) in free-text fields with 400, never 500", async () => {
    for (const field of ["fullName", "companyName", "message"] as const) {
      const email = `nul-${field}-${randomUUID().slice(0, 8)}@example.com`;
      const res = await postWaitlist(
        validPayload({
          email,
          [field]: field === "message" ? `hello${"\u0000"}world` : `A${"\u0000"}B`,
        }),
      );
      assert.equal(res.statusCode, 400, `expected 400 for NUL in ${field}, got ${res.statusCode}`);
      const body = res.json();
      assert.equal(body.error.code, "VALIDATION_ERROR");
      assert.equal(body.error.fields?.[field], "Please review this field.");
      // PII-safe: never echo the submitted control-laden value or email
      assert.equal(res.body.includes("\u0000"), false);
      assert.equal(res.body.includes(email), false);
      const entry = await findWaitlistByEmail(handle.db, email);
      assert.equal(entry, null, `NUL in ${field} must not persist a lead`);
    }
  });

  it("rejects other C0 control characters in fullName and does not persist them", async () => {
    for (const ch of ["\u0001", "\u001B"] as const) {
      const email = `ctrl-${ch.charCodeAt(0)}-${randomUUID().slice(0, 8)}@example.com`;
      const res = await postWaitlist(validPayload({ email, fullName: `Ada${ch}Lovelace` }));
      assert.equal(res.statusCode, 400, `expected 400 for U+${ch.charCodeAt(0).toString(16)}`);
      assert.equal(res.json().error.code, "VALIDATION_ERROR");
      assert.equal(res.json().error.fields?.fullName, "Please review this field.");
      const entry = await findWaitlistByEmail(handle.db, email);
      assert.equal(entry, null);
    }
  });

  it("accepts unicode letters/emoji in free-text and newlines only in message", async () => {
    const email = `unicode-${randomUUID().slice(0, 8)}@example.com`;
    const res = await postWaitlist(
      validPayload({
        email,
        fullName: "José García 日本語 🚀",
        message: "Line one\nLine two\twith tab",
      }),
    );
    assert.equal(res.statusCode, 200);
    const entry = await findWaitlistByEmail(handle.db, email);
    assert.ok(entry);
    assert.equal(entry?.fullName, "José García 日本語 🚀");
    assert.equal(entry?.message, "Line one\nLine two\twith tab");

    // Tab/newline remain disallowed in single-line fullName
    const badName = await postWaitlist(
      validPayload({
        email: `tabname-${randomUUID().slice(0, 8)}@example.com`,
        fullName: "Ada\tLovelace",
      }),
    );
    assert.equal(badName.statusCode, 400);
  });

  it("rejects malformed JSON with generic 400", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/v1/waitlist",
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
      },
      payload: "{not-json",
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error.code, "BAD_REQUEST");
  });

  it("rejects absent/false privacy consent without creating a lead", async () => {
    const email = `noprivacy-${randomUUID().slice(0, 8)}@example.com`;
    const res = await postWaitlist(validPayload({ email, privacyAccepted: false }));
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error.code, "VALIDATION_ERROR");
    const entry = await findWaitlistByEmail(handle.db, email);
    assert.equal(entry, null);
  });

  it("rejects invalid URLs and accepts HTTPS product URLs", async () => {
    const bad = await postWaitlist(validPayload({ productUrl: "javascript:alert(1)" }));
    assert.equal(bad.statusCode, 400);
    const ftp = await postWaitlist(validPayload({ productUrl: "ftp://files.example.com" }));
    assert.equal(ftp.statusCode, 400);
    const good = await postWaitlist(
      validPayload({
        email: `url-${randomUUID().slice(0, 8)}@example.com`,
        productUrl: "https://app.example.com/path",
      }),
    );
    assert.equal(good.statusCode, 200);
  });

  it("rejects unsupported content type, missing origin, disallowed origin, and method", async () => {
    const ct = await ctx.app.inject({
      method: "POST",
      url: "/v1/waitlist",
      headers: { "content-type": "text/plain", origin: ORIGIN },
      payload: "hi",
    });
    assert.ok(ct.statusCode === 415 || ct.statusCode === 400);

    const noOrigin = await ctx.app.inject({
      method: "POST",
      url: "/v1/waitlist",
      headers: { "content-type": "application/json" },
      payload: validPayload(),
    });
    assert.equal(noOrigin.statusCode, 403);

    const badOrigin = await ctx.app.inject({
      method: "POST",
      url: "/v1/waitlist",
      headers: { "content-type": "application/json", origin: "http://evil.example" },
      payload: validPayload(),
    });
    assert.equal(badOrigin.statusCode, 403);

    const method = await ctx.app.inject({ method: "GET", url: "/v1/waitlist" });
    assert.equal(method.statusCode, 405);

    const oversized = await ctx.app.inject({
      method: "POST",
      url: "/v1/waitlist",
      headers: { "content-type": "application/json", origin: ORIGIN },
      payload: JSON.stringify({ pad: "x".repeat(70 * 1024) }),
    });
    assert.equal(oversized.statusCode, 413);
  });
});

describe("POST /v1/waitlist — Turnstile", () => {
  it("rejects missing/failed turnstile without creating records", async () => {
    const email = `ts-${randomUUID().slice(0, 8)}@example.com`;
    const missing = await postWaitlist(validPayload({ email, turnstileToken: "" }));
    assert.ok(missing.statusCode === 400);

    // Rebuild with always-block secret
    await ctx.close();
    rateLimitStore = new MemoryRateLimitStore();
    ctx = await buildApp({
      env: envOverrides({
        TURNSTILE_SECRET_KEY: CLOUDFLARE_TURNSTILE_TEST_SECRETS.alwaysBlocks,
      }),
      database: handle,
      rateLimitStore,
      turnstile: new CloudflareTurnstileVerifier(CLOUDFLARE_TURNSTILE_TEST_SECRETS.alwaysBlocks),
    });
    await ctx.app.ready();

    const failed = await postWaitlist(
      validPayload({ email: `ts2-${randomUUID().slice(0, 8)}@example.com` }),
    );
    assert.equal(failed.statusCode, 400);
    assert.equal(failed.json().error.code, "TURNSTILE_FAILED");
    assert.equal(failed.body.includes(TURNSTILE_TOKEN), false);

    // Restore pass verifier
    await ctx.close();
    rateLimitStore = new MemoryRateLimitStore();
    ctx = await buildApp({
      env: envOverrides(),
      database: handle,
      rateLimitStore,
      turnstile: new PassThroughTurnstileVerifier(),
    });
    await ctx.app.ready();
  });

  it("DI adapters work; production-style config cannot use request bypass fields", async () => {
    const reject = new RejectTurnstileVerifier();
    const r = await reject.verify("anything");
    assert.equal(r.success, false);

    const pass = new PassThroughTurnstileVerifier();
    assert.equal((await pass.verify("t")).success, true);

    // Request-level bypass fields must not succeed when turnstile rejects
    await ctx.close();
    rateLimitStore = new MemoryRateLimitStore();
    ctx = await buildApp({
      env: envOverrides({
        NODE_ENV: "production",
        ENABLE_TEST_SURFACE: "false",
        TURNSTILE_SECRET_KEY: "prod-style-turnstile",
      }),
      database: handle,
      rateLimitStore,
      turnstile: new RejectTurnstileVerifier(),
    });
    await ctx.app.ready();

    const bypass = await postWaitlist(
      validPayload({
        turnstileToken: "x",
        bypassTurnstile: true,
        testMode: true,
      } as never),
    );
    // Either validation (unknown keys) or turnstile failure — never accept
    assert.notEqual(bypass.statusCode, 200);

    await ctx.close();
    rateLimitStore = new MemoryRateLimitStore();
    ctx = await buildApp({
      env: envOverrides(),
      database: handle,
      rateLimitStore,
      turnstile: new PassThroughTurnstileVerifier(),
    });
    await ctx.app.ready();
  });
});

describe("POST /v1/waitlist — rate limits", () => {
  it("IP limit returns 429 while another IP remains eligible", async () => {
    await ctx.close();
    rateLimitStore = new MemoryRateLimitStore();
    ctx = await buildApp({
      env: envOverrides({ RATE_LIMIT_IP_MAX: "3", RATE_LIMIT_EMAIL_MAX: "100" }),
      database: handle,
      rateLimitStore,
      turnstile: new PassThroughTurnstileVerifier(),
    });
    await ctx.app.ready();

    for (let i = 0; i < 3; i++) {
      const res = await postWaitlist(
        validPayload({
          email: `ip-a-${i}-${randomUUID().slice(0, 6)}@example.com`,
          idempotencyKey: randomUUID(),
        }),
        { "x-forwarded-for": "198.51.100.1" },
      );
      assert.equal(res.statusCode, 200, `expected 200 on attempt ${i + 1}`);
    }
    const limited = await postWaitlist(
      validPayload({ email: `ip-a-over@example.com`, idempotencyKey: randomUUID() }),
      { "x-forwarded-for": "198.51.100.1" },
    );
    assert.equal(limited.statusCode, 429);
    assert.equal(limited.json().error.code, "RATE_LIMITED");
    assert.equal(limited.body.includes("198.51.100"), false);

    const other = await postWaitlist(
      validPayload({
        email: `ip-b-${randomUUID().slice(0, 6)}@example.com`,
        idempotencyKey: randomUUID(),
      }),
      { "x-forwarded-for": "198.51.100.99" },
    );
    assert.equal(other.statusCode, 200);

    await ctx.close();
    rateLimitStore = new MemoryRateLimitStore();
    ctx = await buildApp({
      env: envOverrides(),
      database: handle,
      rateLimitStore,
      turnstile: new PassThroughTurnstileVerifier(),
    });
    await ctx.app.ready();
  });

  it("email-aware limit applies across different IPs", async () => {
    await ctx.close();
    rateLimitStore = new MemoryRateLimitStore();
    ctx = await buildApp({
      env: envOverrides({ RATE_LIMIT_IP_MAX: "100", RATE_LIMIT_EMAIL_MAX: "2" }),
      database: handle,
      rateLimitStore,
      turnstile: new PassThroughTurnstileVerifier(),
    });
    await ctx.app.ready();

    const email = `shared-${randomUUID().slice(0, 8)}@example.com`;
    const a = await postWaitlist(validPayload({ email, idempotencyKey: randomUUID() }), {
      "x-forwarded-for": "203.0.113.1",
    });
    const b = await postWaitlist(validPayload({ email, idempotencyKey: randomUUID() }), {
      "x-forwarded-for": "203.0.113.2",
    });
    assert.equal(a.statusCode, 200);
    assert.equal(b.statusCode, 200);
    const c = await postWaitlist(validPayload({ email, idempotencyKey: randomUUID() }), {
      "x-forwarded-for": "203.0.113.3",
    });
    assert.equal(c.statusCode, 429);

    await ctx.close();
    rateLimitStore = new MemoryRateLimitStore();
    ctx = await buildApp({
      env: envOverrides(),
      database: handle,
      rateLimitStore,
      turnstile: new PassThroughTurnstileVerifier(),
    });
    await ctx.app.ready();
  });
});

describe("POST /v1/waitlist — abuse signals", () => {
  it("honeypot and too-quick return generic success without persisting", async () => {
    const hpEmail = `hp-${randomUUID().slice(0, 8)}@example.com`;
    const hp = await postWaitlist(validPayload({ email: hpEmail, website: "http://spam.example" }));
    assert.equal(hp.statusCode, 200);
    assert.equal(hp.json().data.accepted, true);
    assert.equal(await findWaitlistByEmail(handle.db, hpEmail), null);

    const quickEmail = `quick-${randomUUID().slice(0, 8)}@example.com`;
    const quick = await postWaitlist(
      validPayload({ email: quickEmail, formStartedAt: Date.now() - 1 }),
    );
    assert.equal(quick.statusCode, 200);
    assert.equal(await findWaitlistByEmail(handle.db, quickEmail), null);
    // No disclosure of which signal
    assert.equal(quick.body.toLowerCase().includes("honeypot"), false);
    assert.equal(quick.body.toLowerCase().includes("too_quick"), false);
    assert.equal(quick.body.toLowerCase().includes("abuse"), false);
  });
});

describe("POST /v1/waitlist — idempotency + duplicates", () => {
  it("replays identical idempotency key with one lead and two outbox jobs", async () => {
    const key = randomUUID();
    const email = `idem-${randomUUID().slice(0, 8)}@example.com`;
    const payload = validPayload({ email, idempotencyKey: key });
    const a = await postWaitlist(payload);
    const b = await postWaitlist(payload);
    assert.equal(a.statusCode, 200);
    assert.equal(b.statusCode, 200);
    assert.deepEqual(a.json(), b.json());
    assert.equal(a.json().data.accepted, true);
    assert.equal(typeof a.json().data.applicationId, "string");
    const entry = await findWaitlistByEmail(handle.db, email);
    assert.ok(entry);
    assert.equal(entry.submissionCount, 1);
    // Applicant confirmation + internal lead notification; replay does not create more.
    assert.equal(await countOutboxForEntry(handle.db, entry.id), 2);
  });

  it("conflicts when idempotency key is reused with different payload", async () => {
    const key = randomUUID();
    const email = `idemc-${randomUUID().slice(0, 8)}@example.com`;
    const a = await postWaitlist(validPayload({ email, idempotencyKey: key, fullName: "One" }));
    assert.equal(a.statusCode, 200);
    const b = await postWaitlist(
      validPayload({ email, idempotencyKey: key, fullName: "Two Different" }),
    );
    assert.equal(b.statusCode, 409);
    assert.equal(b.json().error.code, "IDEMPOTENCY_CONFLICT");
    const entry = await findWaitlistByEmail(handle.db, email);
    assert.equal(entry?.fullName, "One");
  });

  it("concurrent same-email posts yield one lead and generic success", async () => {
    const email = `conc-${randomUUID().slice(0, 8)}@example.com`;
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        postWaitlist(
          validPayload({ email, idempotencyKey: randomUUID(), fullName: "Concurrent" }),
          { "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 200) + 1}` },
        ),
      ),
    );
    for (const r of results) {
      assert.equal(r.statusCode, 200);
      assert.equal(r.json().data.accepted, true);
      assert.equal(r.body.toLowerCase().includes("already"), false);
      assert.equal(r.body.toLowerCase().includes("duplicate"), false);
    }
    const rows =
      await handle.sql`SELECT count(*)::int AS c FROM waitlist_entries WHERE email = ${email}`;
    assert.equal(rows[0]?.c, 1);
  });

  it("upsert updates mutable fields, preserves first-seen and original attribution", async () => {
    const email = `upsert-${randomUUID().slice(0, 8)}@example.com`;
    const first = await postWaitlist(
      validPayload({
        email,
        fullName: "First",
        utm: { source: "first-source", medium: "m", campaign: "c", content: null, term: null },
        landingPage: "/first",
        referrer: "https://first.example/",
        idempotencyKey: randomUUID(),
      }),
    );
    assert.equal(first.statusCode, 200);
    const original = await findWaitlistByEmail(handle.db, email);
    assert.ok(original);
    const createdAt = original.createdAt;

    await new Promise((r) => setTimeout(r, 20));

    const second = await postWaitlist(
      validPayload({
        email,
        fullName: "Second",
        companyName: "New Co",
        message: "Updated message for the application.",
        utm: { source: "second-source", medium: "x", campaign: "y", content: null, term: null },
        landingPage: "/second",
        referrer: "https://second.example/",
        marketingConsent: true,
        idempotencyKey: randomUUID(),
      }),
    );
    assert.equal(second.statusCode, 200);
    const updated = await findWaitlistByEmail(handle.db, email);
    assert.ok(updated);
    assert.equal(updated.fullName, "Second");
    assert.equal(updated.companyName, "New Co");
    assert.equal(updated.submissionCount, 2);
    assert.equal(updated.utmSource, "first-source");
    assert.equal(updated.landingPage, "/first");
    assert.equal(updated.referrer, "https://first.example/");
    assert.equal(updated.createdAt.getTime(), createdAt.getTime());
    assert.ok(updated.lastSubmittedAt.getTime() >= createdAt.getTime());
    assert.equal(updated.marketingConsent, true);
    assert.ok(updated.marketingConsentAt);
    assert.ok(updated.privacyAcceptedAt);
  });
});

describe("POST /v1/waitlist — rollback + scoring + UTM + IP hash", () => {
  it("rolls back lead when outbox fault is forced", async () => {
    const email = `fault-${randomUUID().slice(0, 8)}@example.com`;
    try {
      await persistWaitlistIntake(
        handle.db,
        {
          application: validPayload({ email }) as never,
          ipHash: "v1:" + "a".repeat(64),
          userAgent: null,
          priorityScore: 1,
        },
        { faultOutbox: true },
      );
      assert.fail("expected fault");
    } catch {
      // expected
    }
    assert.equal(await findWaitlistByEmail(handle.db, email), null);
  });

  it("rolls back when lead fault is forced", async () => {
    const email = `fault2-${randomUUID().slice(0, 8)}@example.com`;
    try {
      await persistWaitlistIntake(
        handle.db,
        {
          application: validPayload({ email }) as never,
          ipHash: "v1:" + "b".repeat(64),
          userAgent: null,
          priorityScore: 1,
        },
        { faultLead: true },
      );
      assert.fail("expected fault");
    } catch {
      // expected
    }
    assert.equal(await findWaitlistByEmail(handle.db, email), null);
  });

  it("computes deterministic low and high scores", () => {
    const low = computeLeadScore(
      validPayload({
        stage: "prototype",
        primaryBlocker: "other",
        desiredStartWindow: "later",
        budgetRange: "under_25k",
        commercialDeadline: false,
      }) as never,
    );
    const high = computeLeadScore(
      validPayload({
        stage: "enterprise_pipeline",
        primaryBlocker: "security_compliance",
        desiredStartWindow: "asap",
        budgetRange: "300k_plus",
        commercialDeadline: true,
      }) as never,
    );
    assert.ok(low.total < high.total);
    assert.ok(high.total >= 8);
  });

  it("accepts UTM at limit and rejects over-limit", async () => {
    const atLimit = "u".repeat(UTM_MAX_LENGTH);
    const email = `utm-${randomUUID().slice(0, 8)}@example.com`;
    const ok = await postWaitlist(
      validPayload({
        email,
        utm: { source: atLimit, medium: "m", campaign: "c", content: null, term: null },
        idempotencyKey: randomUUID(),
      }),
    );
    assert.equal(ok.statusCode, 200);
    const entry = await findWaitlistByEmail(handle.db, email);
    assert.equal(entry?.utmSource, atLimit);

    const over = await postWaitlist(
      validPayload({
        email: `utm2-${randomUUID().slice(0, 8)}@example.com`,
        utm: {
          source: "u".repeat(UTM_MAX_LENGTH + 1),
          medium: "m",
          campaign: "c",
          content: null,
          term: null,
        },
        idempotencyKey: randomUUID(),
      }),
    );
    assert.equal(over.statusCode, 400);
  });

  it("stores versioned salted IP hashes, never raw IPs; rotation produces distinct hashes", async () => {
    const email = `iph-${randomUUID().slice(0, 8)}@example.com`;
    const res = await postWaitlist(validPayload({ email }), { "x-forwarded-for": "203.0.113.77" });
    assert.equal(res.statusCode, 200);
    const entry = await findWaitlistByEmail(handle.db, email);
    assert.ok(entry?.ipHash);
    assert.equal(isVersionedIpHash(entry!.ipHash), true);
    assert.equal(looksLikeRawIp(entry!.ipHash!), false);
    assert.equal(entry!.ipHash!.includes("203.0.113"), false);

    const env = envOverrides({
      IP_HASH_SALT: "test-ip-salt-primary-value",
      IP_HASH_SALT_VERSION: "2",
      IP_HASH_SALT_PREVIOUS: "test-ip-salt-previous-value",
      IP_HASH_SALT_PREVIOUS_VERSION: "1",
    });
    const hashed = hashIpAddress("203.0.113.77", env);
    assert.ok(hashed);
    assert.equal(hashed.rotationHashes.length, 2);
    assert.ok(hashed.rotationHashes.every(isVersionedIpHash));
  });
});

describe("test surface + integration report", () => {
  it("inspect surface returns score/utm/ipHash without raw email or IP", async () => {
    const email = `inspect-${randomUUID().slice(0, 8)}@example.com`;
    await postWaitlist(validPayload({ email, idempotencyKey: randomUUID() }));
    const res = await ctx.app.inject({
      method: "GET",
      url: `/v1/test/waitlist/inspect?email=${encodeURIComponent(email)}`,
    });
    assert.equal(res.statusCode, 200);
    const data = res.json().data;
    assert.ok(data.entry.priorityScore >= 0);
    assert.equal(data.entry.ipHashIsVersioned, true);
    assert.equal(data.entry.ipHashLooksLikeRawIp, false);
    assert.equal(res.body.includes(email), false);
    assert.ok(data.entry.utm.source);

    const catalog = await ctx.app.inject({ method: "GET", url: "/v1/test-support" });
    assert.equal(catalog.statusCode, 200);
    assert.equal(catalog.json().data.enabled, true);
    assert.ok(catalog.json().data.routes.report.path);

    const leads = await ctx.app.inject({
      method: "GET",
      url: `/v1/test-support/leads?email=${encodeURIComponent(email)}`,
    });
    assert.equal(leads.statusCode, 200);
    assert.equal(leads.json().data.outboxCount, 2);

    const outbox = await ctx.app.inject({
      method: "GET",
      url: `/v1/test-support/outbox?email=${encodeURIComponent(email)}`,
    });
    assert.equal(outbox.statusCode, 200);
    assert.equal(outbox.json().data.outboxCount, 2);
    const kinds = new Set((outbox.json().data.items as Array<{ kind: string }>).map((i) => i.kind));
    assert.ok(kinds.has("applicant_confirmation"));
    assert.ok(kinds.has("internal_lead_notification"));
    assert.equal(outbox.body.includes(email), false);

    const faultArm = await ctx.app.inject({
      method: "POST",
      url: "/v1/test-support/fault",
      headers: { "content-type": "application/json" },
      payload: { mode: "outbox", count: 1 },
    });
    assert.equal(faultArm.statusCode, 200);
    assert.equal(faultArm.json().data.mode, "outbox");

    const faultEmail = `fault-arm-${randomUUID().slice(0, 8)}@example.com`;
    const faulted = await postWaitlist(
      validPayload({ email: faultEmail, idempotencyKey: randomUUID() }),
    );
    assert.equal(faulted.statusCode, 500);
    assert.equal(await findWaitlistByEmail(handle.db, faultEmail), null);

    const report = await ctx.app.inject({ method: "GET", url: "/v1/test-support/report" });
    assert.equal(report.statusCode, 200);
    const reportBody = report.json().data;
    assert.equal(typeof reportBody.ready, "boolean");
    assert.ok(reportBody.coverage.valid_intake);
    assert.ok(reportBody.coverage.invalid_fields);
    assert.ok(reportBody.coverage.privacy_rejection);
    assert.ok(reportBody.coverage.outbox_creation);
    assert.ok(reportBody.coverage.scoring);
    assert.ok(reportBody.coverage.pii_safe_structured_logging);
    assert.ok(reportBody.coverage.transaction_rollback);
  });

  it("availability and health still work", async () => {
    const h = await ctx.app.inject({ method: "GET", url: "/healthz" });
    assert.equal(h.statusCode, 200);
    const a = await ctx.app.inject({ method: "GET", url: "/v1/public/availability" });
    assert.equal(a.statusCode, 200);
    assert.ok(a.json().data.status);
  });
});
