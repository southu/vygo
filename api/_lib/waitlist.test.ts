/**
 * Edge waitlist handler + validation tests (no database; uses injected stores).
 * Covers a successful request, invalid-input rejection, safe duplicate handling,
 * and sanitized database-error responses.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleWaitlist } from "./handler.js";
import { createMemoryStore } from "./store.js";
import { normalizeHttpsUrl, parseWaitlist } from "./validation.js";
import type { UpsertResult, WaitlistStore } from "./store.js";
import type { WaitlistValue } from "./validation.js";

const APP_ID = "8f3c1e2a-0000-4000-8000-000000000001";
const NUL = String.fromCharCode(0);

/** Fake store: simulates the UNIQUE(email) upsert — first insert, then update. */
class FakeStore implements WaitlistStore {
  readonly seen = new Set<string>();
  calls = 0;
  lastSource: string | null = null;
  async upsert(value: WaitlistValue, source: string): Promise<UpsertResult> {
    this.calls += 1;
    this.lastSource = source;
    const inserted = !this.seen.has(value.email);
    this.seen.add(value.email);
    return { id: APP_ID, inserted };
  }
}

/** Store that fails the way a real DB outage would — with a leaky message. */
class ThrowingStore implements WaitlistStore {
  async upsert(): Promise<UpsertResult> {
    throw new Error(
      "connect ECONNREFUSED postgresql://vygo:s3cr3t@db.internal:5432/vygo " +
        "while running INSERT INTO waitlist_entries",
    );
  }
}

function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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
    turnstileToken: "XXXX.DUMMY.TOKEN.XXXX",
    utm: { source: "linkedin", medium: "social", campaign: "teardown", content: null, term: null },
    landingPage: "/waitlist",
    referrer: "https://www.linkedin.com/",
    website: "",
    ...overrides,
  };
}

describe("edge waitlist — successful request", () => {
  it("accepts a valid submission with a durable applicationId and no PII echo", async () => {
    const store = new FakeStore();
    const res = await handleWaitlist(store, validPayload());
    assert.equal(res.status, 200);
    const data = (res.body as { data: Record<string, unknown> }).data;
    assert.equal(data.accepted, true);
    assert.equal(data.applicationId, APP_ID);
    assert.equal(data.duplicate, false);
    assert.equal(store.calls, 1);
    assert.equal(store.lastSource, "web");
    // Success body never echoes email / turnstile token / raw name.
    const serialized = JSON.stringify(res.body).toLowerCase();
    assert.equal(serialized.includes("example.com"), false);
    assert.equal(serialized.includes("dummy.token"), false);
  });

  it("trims email whitespace and preserves submitted casing for durable storage", async () => {
    const store = new FakeStore();
    const captured: { value: WaitlistValue | null } = { value: null };
    const spy: WaitlistStore = {
      async upsert(value, source) {
        captured.value = value;
        return store.upsert(value, source);
      },
    };
    const res = await handleWaitlist(spy, validPayload({ email: "  Mixed.Case+x@Example.ORG " }));
    assert.equal(res.status, 200);
    assert.ok(captured.value);
    assert.equal(captured.value.email, "Mixed.Case+x@Example.ORG");
    assert.equal(captured.value.fullName, "Jordan Lee");
    assert.equal(captured.value.productUrl, "https://example.com/app");
  });
});

describe("edge waitlist — invalid input", () => {
  it("rejects a missing/invalid email with 400 and no acknowledgement", async () => {
    const store = new FakeStore();
    const res = await handleWaitlist(store, validPayload({ email: "not-an-email" }));
    assert.equal(res.status, 400);
    const body = res.body as { error: { code: string; fields: Record<string, string> } };
    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.equal(body.error.fields.email, "Enter a valid work email.");
    assert.equal(store.calls, 0);
    // Never persisted, never acknowledged, never echoes the bad value.
    assert.equal(JSON.stringify(res.body).includes("not-an-email"), false);
    assert.equal("data" in res.body, false);
  });

  it("rejects absent privacy consent without persisting", async () => {
    const store = new FakeStore();
    const res = await handleWaitlist(store, validPayload({ privacyAccepted: false }));
    assert.equal(res.status, 400);
    const body = res.body as { error: { code: string; fields: Record<string, string> } };
    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.equal(body.error.fields.privacyAccepted, "Privacy acceptance is required.");
    assert.equal(store.calls, 0);
  });

  it("rejects an invalid enum and a non-HTTPS product URL", async () => {
    const store = new FakeStore();
    const badStage = await handleWaitlist(store, validPayload({ stage: "not_a_stage" }));
    assert.equal(badStage.status, 400);
    const badUrl = await handleWaitlist(store, validPayload({ productUrl: "javascript:alert(1)" }));
    assert.equal(badUrl.status, 400);
    assert.equal(
      (badUrl.body as { error: { fields: Record<string, string> } }).error.fields.productUrl,
      "Enter a valid HTTPS product URL.",
    );
    assert.equal(store.calls, 0);
  });

  it("rejects control characters and over-limit fields, never 500", async () => {
    const store = new FakeStore();
    const nul = await handleWaitlist(store, validPayload({ fullName: `A${NUL}B` }));
    assert.equal(nul.status, 400);
    assert.equal(JSON.stringify(nul.body).includes(NUL), false);
    const tooLong = await handleWaitlist(store, validPayload({ fullName: "x".repeat(200) }));
    assert.equal(tooLong.status, 400);
    assert.equal(
      (tooLong.body as { error: { fields: Record<string, string> } }).error.fields.fullName,
      "Value exceeds the maximum allowed length.",
    );
    assert.equal(store.calls, 0);
  });

  it("rejects a non-object body with a generic 400", async () => {
    const store = new FakeStore();
    for (const bad of [null, "hello", 42, [1, 2, 3]]) {
      const res = await handleWaitlist(store, bad);
      assert.equal(res.status, 400);
      assert.equal((res.body as { error: { code: string } }).error.code, "BAD_REQUEST");
    }
    assert.equal(store.calls, 0);
  });
});

describe("edge waitlist — safe duplicate handling", () => {
  it("returns an accepted duplicate outcome on a repeated submission, no server error", async () => {
    const store = new FakeStore();
    const first = await handleWaitlist(store, validPayload());
    const second = await handleWaitlist(store, validPayload());
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    const firstData = (first.body as { data: Record<string, unknown> }).data;
    const secondData = (second.body as { data: Record<string, unknown> }).data;
    assert.equal(firstData.duplicate, false);
    assert.equal(secondData.accepted, true);
    assert.equal(secondData.duplicate, true);
    // Duplicate message is detectable by the frontend (matches /already|duplicate/i).
    assert.match(String(secondData.message), /already|duplicate/i);
    assert.equal(store.calls, 2);
  });

  it("honeypot submissions are silently accepted without persistence", async () => {
    const store = new FakeStore();
    const res = await handleWaitlist(store, validPayload({ website: "http://spam.example" }));
    assert.equal(res.status, 200);
    assert.equal((res.body as { data: { accepted: boolean } }).data.accepted, true);
    assert.equal(store.calls, 0);
    const serialized = JSON.stringify(res.body).toLowerCase();
    assert.equal(serialized.includes("honeypot"), false);
    assert.equal(serialized.includes("spam"), false);
  });
});

describe("edge waitlist — sanitized failures", () => {
  it("collapses a database error to a generic 500 with no leaked internals", async () => {
    const res = await handleWaitlist(new ThrowingStore(), validPayload());
    assert.equal(res.status, 500);
    const body = res.body as { error: { code: string; message: string } };
    assert.equal(body.error.code, "INTERNAL_ERROR");
    const serialized = JSON.stringify(res.body).toLowerCase();
    for (const secret of [
      "postgresql://",
      "s3cr3t",
      "db.internal",
      "econnrefused",
      "insert into",
      "waitlist_entries",
      "5432",
    ]) {
      assert.equal(serialized.includes(secret), false, `leaked: ${secret}`);
    }
  });

  it("returns a sanitized 503 when no database is configured", async () => {
    const res = await handleWaitlist(null, validPayload());
    assert.equal(res.status, 503);
    assert.equal((res.body as { error: { code: string } }).error.code, "UNAVAILABLE");
    assert.equal(JSON.stringify(res.body).toLowerCase().includes("database_url"), false);
  });
});

describe("edge waitlist — no-database fallback store", () => {
  it("accepts a valid submission via the in-memory fallback (never 503)", async () => {
    const store = createMemoryStore(new Map());
    const res = await handleWaitlist(store, validPayload());
    assert.equal(res.status, 200);
    const data = (res.body as { data: Record<string, unknown> }).data;
    assert.equal(data.accepted, true);
    assert.equal(data.duplicate, false);
    assert.equal(typeof data.applicationId, "string");
    assert.notEqual(String(data.applicationId).length, 0);
  });

  it("reports a repeat submission for the same email as a safe duplicate, no 5xx", async () => {
    const store = createMemoryStore(new Map());
    const first = await handleWaitlist(store, validPayload());
    const second = await handleWaitlist(store, validPayload());
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    const firstData = (first.body as { data: Record<string, unknown> }).data;
    const secondData = (second.body as { data: Record<string, unknown> }).data;
    assert.equal(firstData.duplicate, false);
    assert.equal(secondData.duplicate, true);
    // Stable applicationId across duplicate submissions, mirroring UNIQUE(email).
    assert.equal(firstData.applicationId, secondData.applicationId);
    assert.match(String(secondData.message), /already|duplicate|registered/i);
  });

  it("keeps distinct emails independent", async () => {
    const store = createMemoryStore(new Map());
    const a = await handleWaitlist(store, validPayload({ email: "a@example.com" }));
    const b = await handleWaitlist(store, validPayload({ email: "b@example.com" }));
    assert.equal((a.body as { data: { duplicate: boolean } }).data.duplicate, false);
    assert.equal((b.body as { data: { duplicate: boolean } }).data.duplicate, false);
  });
});

describe("edge waitlist — validation unit helpers", () => {
  it("normalizeHttpsUrl accepts https, strips credentials, rejects other schemes", () => {
    assert.equal(normalizeHttpsUrl("https://app.example.com/x"), "https://app.example.com/x");
    assert.equal(normalizeHttpsUrl("HTTPS://User:Pass@Example.com/"), "https://example.com/");
    assert.equal(normalizeHttpsUrl("ftp://files.example.com"), null);
    assert.equal(normalizeHttpsUrl("javascript:alert(1)"), null);
    assert.equal(normalizeHttpsUrl("http://example.com"), null);
    assert.equal(normalizeHttpsUrl("http://localhost:3000/x"), "http://localhost:3000/x");
  });

  it("parseWaitlist accepts unicode letters and newlines only in message", () => {
    const ok = parseWaitlist(validPayload({ fullName: "José García 🚀", message: "a\nb\tc" }));
    assert.equal(ok.ok, true);
    const badName = parseWaitlist(validPayload({ fullName: "Ada\tLovelace" }));
    assert.equal(badName.ok, false);
  });
});
