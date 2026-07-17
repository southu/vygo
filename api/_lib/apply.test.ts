/**
 * Apply-form + guide_updates intake tests (no database).
 *
 * Route under test: POST /api/apply with source=guide_updates
 * (same path as standard apply; discriminator is body.source).
 *
 * Negative-path contract: method/body hygiene is enforced by the edge wrapper;
 * this file proves validation-before-insert, source correctness, duplicate
 * soft-success, and response hygiene for guide_updates.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GUIDE_UPDATES_SOURCE,
  guideUpdatesSuccessBody,
  handleApplyIntake,
  isPlausibleWorkEmail,
  isUniqueConstraintError,
  parseApplyBody,
  scrubGuideUpdatesResponse,
  type ApplyParsed,
  type ApplyPublicRow,
  type ApplyPersist,
} from "./apply.js";
import { readJsonBody } from "./http.js";

const SAMPLE_ROW: ApplyPublicRow = {
  id: "11111111-1111-4111-8111-111111111111",
  full_name: "Guide updates",
  work_email: "user@example.com",
  product_url: null,
  message: "guide updates opt-in",
  source: GUIDE_UPDATES_SOURCE,
  created_at: "2026-07-17T00:00:00.000Z",
};

/** Counting persist — proves invalid bodies never call insert. */
class CountingPersist implements ApplyPersist {
  calls = 0;
  lastValue: ApplyParsed | null = null;
  rows: ApplyPublicRow[] = [];
  async insert(value: ApplyParsed): Promise<ApplyPublicRow> {
    this.calls += 1;
    this.lastValue = value;
    const row: ApplyPublicRow = {
      ...SAMPLE_ROW,
      full_name: value.fullName,
      work_email: value.workEmail,
      product_url: value.productUrl,
      message: value.message,
      source: value.source ?? GUIDE_UPDATES_SOURCE,
      id: `00000000-0000-4000-8000-${String(this.calls).padStart(12, "0")}`,
    };
    this.rows.push(row);
    return row;
  }
}

class UniqueThrowingPersist implements ApplyPersist {
  calls = 0;
  async insert(): Promise<ApplyPublicRow> {
    this.calls += 1;
    throw new Error(
      'duplicate key value violates unique constraint "applications_work_email_key" (23505)',
    );
  }
}

class LeakyThrowingPersist implements ApplyPersist {
  async insert(): Promise<ApplyPublicRow> {
    throw new Error(
      "connect ECONNREFUSED postgresql://vygo:s3cr3t@db.internal:5432/vygo while running INSERT INTO applications",
    );
  }
}

function assertNoSecrets(body: unknown, submittedEmail?: string): void {
  const raw = JSON.stringify(body);
  assert.equal(/postgres(?:ql)?:\/\//i.test(raw), false, "leaked connection string");
  assert.equal(/Traceback/i.test(raw), false, "leaked traceback");
  assert.equal(/psycopg/i.test(raw), false, "leaked psycopg");
  assert.equal(/at\s+\S+\s+\([^)]+:\d+:\d+\)/.test(raw), false, "leaked stack frame");
  if (submittedEmail) {
    assert.equal(
      raw.toLowerCase().includes(submittedEmail.toLowerCase()),
      false,
      "echoed submitted email",
    );
  }
}

describe("isPlausibleWorkEmail", () => {
  it("accepts typical work emails", () => {
    assert.equal(isPlausibleWorkEmail("ratchet-tester@example.com"), true);
    assert.equal(isPlausibleWorkEmail("  Jordan.Lee+Tag@Example.COM "), true);
  });

  it("rejects missing @ or domain", () => {
    assert.equal(isPlausibleWorkEmail("not-an-email"), false);
    assert.equal(isPlausibleWorkEmail("missing-domain@"), false);
    assert.equal(isPlausibleWorkEmail("@nodomain.com"), false);
    assert.equal(isPlausibleWorkEmail("local@nodot"), false);
    assert.equal(isPlausibleWorkEmail(""), false);
  });
});

describe("parseApplyBody", () => {
  it("accepts snake_case and camelCase payloads", () => {
    const a = parseApplyBody({
      full_name: "Ratchet Tester",
      work_email: "ratchet-tester@example.com",
    });
    assert.equal(a.ok, true);
    if (a.ok) {
      assert.equal(a.value.fullName, "Ratchet Tester");
      assert.equal(a.value.workEmail, "ratchet-tester@example.com");
    }

    const b = parseApplyBody({
      fullName: "Ratchet Tester",
      email: "ratchet-tester@example.com",
      productUrl: "https://example.com",
      message: "Ship it",
    });
    assert.equal(b.ok, true);
    if (b.ok) {
      assert.equal(b.value.productUrl, "https://example.com");
      assert.equal(b.value.message, "Ship it");
    }
  });

  it("rejects empty full_name with 4xx and no row id", () => {
    const result = parseApplyBody({
      full_name: "   ",
      work_email: "ratchet-tester@example.com",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 400);
      assert.equal(
        result.body.error && (result.body.error as { code?: string }).code,
        "VALIDATION_ERROR",
      );
      // Invalid input must not look like a successful insert.
      assert.equal("id" in result.body, false);
    }
  });

  it("rejects implausible work_email with 4xx and no row id", () => {
    const result = parseApplyBody({
      full_name: "Ratchet Tester",
      work_email: "not-an-email",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 400);
      assert.equal(
        result.body.error && (result.body.error as { code?: string }).code,
        "VALIDATION_ERROR",
      );
      assert.equal("id" in result.body, false);
    }
  });

  it("accepts guide_updates with email only and normalizes address", () => {
    const result = parseApplyBody({
      source: "guide_updates",
      email: "  Guide.User+Tag@Example.COM ",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.isGuideUpdates, true);
      assert.equal(result.value.source, "guide_updates");
      assert.equal(result.value.workEmail, "guide.user+tag@example.com");
      assert.equal(result.value.fullName, "Guide updates");
      assert.equal(result.value.message, "guide updates opt-in");
    }
  });

  it("accepts guide_updates with work_email alias", () => {
    const result = parseApplyBody({
      source: "guide_updates",
      work_email: "alias@example.com",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.workEmail, "alias@example.com");
      assert.equal(result.value.source, "guide_updates");
    }
  });

  it("rejects guide_updates with invalid email and no row id", () => {
    const result = parseApplyBody({
      source: "guide_updates",
      email: "not-an-email",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 400);
      assert.equal("id" in result.body, false);
    }
  });

  it("rejects guide_updates with empty body fields (missing email)", () => {
    const result = parseApplyBody({ source: "guide_updates" });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 400);
      assertNoSecrets(result.body);
    }
  });

  it("rejects guide_updates empty email string with 4xx and no email echo", () => {
    const email = "ratchet-qa+empty@example.com";
    // empty string is missing; also try whitespace-only
    for (const bad of ["", "   ", null]) {
      const result = parseApplyBody({ source: "guide_updates", email: bad });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.status, 400);
        assertNoSecrets(result.body, typeof bad === "string" ? bad.trim() || undefined : undefined);
        assert.equal("id" in result.body, false);
      }
    }
    // Ensure a realistic address used as input is not echoed on garbage either.
    const garbage = parseApplyBody({ source: "guide_updates", email: "not-an-email" });
    assert.equal(garbage.ok, false);
    if (!garbage.ok) {
      assertNoSecrets(garbage.body, "not-an-email");
      assertNoSecrets(garbage.body, email);
    }
  });

  it("rejects empty object as apply (not guide_updates) with 4xx", () => {
    const result = parseApplyBody({});
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 400);
    }
  });
});

describe("handleApplyIntake — guide_updates negative paths (validation before insert)", () => {
  it("never calls insert for missing email", async () => {
    const store = new CountingPersist();
    const res = await handleApplyIntake({ source: "guide_updates" }, store);
    assert.equal(res.status, 400);
    assert.equal(store.calls, 0);
    assert.equal(
      (res.body.error as { code?: string } | undefined)?.code,
      "VALIDATION_ERROR",
    );
    assertNoSecrets(res.body);
  });

  it("never calls insert for empty email", async () => {
    const store = new CountingPersist();
    const res = await handleApplyIntake(
      { source: "guide_updates", email: "" },
      store,
    );
    assert.equal(res.status, 400);
    assert.equal(store.calls, 0);
    assertNoSecrets(res.body);
  });

  it("never calls insert for garbage email and does not echo it", async () => {
    const store = new CountingPersist();
    const bad = "not-an-email";
    const res = await handleApplyIntake(
      { source: "guide_updates", email: bad },
      store,
    );
    assert.equal(res.status, 400);
    assert.equal(store.calls, 0);
    assertNoSecrets(res.body, bad);
    assert.equal("id" in res.body, false);
  });

  it("never calls insert for non-object / array body", async () => {
    const store = new CountingPersist();
    for (const bad of [null, "hello", 42, [1, 2, 3]]) {
      const res = await handleApplyIntake(bad, store);
      assert.equal(res.status, 400);
    }
    assert.equal(store.calls, 0);
  });

  it("inserts with source=guide_updates unconditionally on valid email", async () => {
    const store = new CountingPersist();
    const email = "ratchet-qa+ok@example.com";
    const res = await handleApplyIntake(
      { source: "guide_updates", email },
      store,
    );
    assert.equal(res.status, 200);
    assert.equal(store.calls, 1);
    assert.ok(store.lastValue);
    assert.equal(store.lastValue.source, GUIDE_UPDATES_SOURCE);
    assert.equal(store.lastValue.isGuideUpdates, true);
    assert.equal(store.lastValue.workEmail, email);
    // Friendly success — no email echo, no row dump.
    assert.deepEqual(res.body, guideUpdatesSuccessBody());
    assertNoSecrets(res.body, email);
    assert.equal("id" in res.body, false);
    assert.equal("work_email" in res.body, false);
  });

  it("duplicate email insert-again returns friendly 2xx both times", async () => {
    const store = new CountingPersist();
    const email = "ratchet-qa+dup@example.com";
    const payload = { source: "guide_updates", email };
    const first = await handleApplyIntake(payload, store);
    const second = await handleApplyIntake(payload, store);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(store.calls, 2);
    assert.equal(store.rows.length, 2);
    assert.notEqual(store.rows[0]!.id, store.rows[1]!.id);
    assert.equal(store.rows[0]!.source, GUIDE_UPDATES_SOURCE);
    assert.equal(store.rows[1]!.source, GUIDE_UPDATES_SOURCE);
    for (const res of [first, second]) {
      assert.deepEqual(res.body, guideUpdatesSuccessBody());
      assertNoSecrets(res.body, email);
      const raw = JSON.stringify(res.body).toLowerCase();
      assert.equal(/unique|constraint|duplicate key|already signed/.test(raw), false);
    }
  });

  it("unique-constraint throw still returns friendly guide_updates success", async () => {
    const store = new UniqueThrowingPersist();
    const email = "ratchet-qa+unique@example.com";
    const res = await handleApplyIntake(
      { source: "guide_updates", email },
      store,
    );
    assert.equal(res.status, 200);
    assert.equal(store.calls, 1);
    assert.deepEqual(res.body, guideUpdatesSuccessBody());
    assertNoSecrets(res.body, email);
    const raw = JSON.stringify(res.body).toLowerCase();
    assert.equal(raw.includes("unique"), false);
    assert.equal(raw.includes("23505"), false);
  });

  it("sanitizes unexpected DB errors with no secrets", async () => {
    const res = await handleApplyIntake(
      { source: "guide_updates", email: "ratchet-qa+db@example.com" },
      new LeakyThrowingPersist(),
    );
    assert.equal(res.status, 500);
    assertNoSecrets(res.body, "ratchet-qa+db@example.com");
    const raw = JSON.stringify(res.body).toLowerCase();
    assert.equal(raw.includes("s3cr3t"), false);
    assert.equal(raw.includes("db.internal"), false);
    assert.equal(raw.includes("insert into"), false);
  });

  it("returns 503 when no persist is configured (valid body, no insert)", async () => {
    const res = await handleApplyIntake(
      { source: "guide_updates", email: "ratchet-qa+nodb@example.com" },
      null,
    );
    assert.equal(res.status, 503);
    assert.equal((res.body.error as { code?: string }).code, "UNAVAILABLE");
    assertNoSecrets(res.body, "ratchet-qa+nodb@example.com");
  });
});

describe("guide_updates response helpers", () => {
  it("guideUpdatesSuccessBody is PII-free", () => {
    const body = guideUpdatesSuccessBody();
    assert.equal(body.ok, true);
    assert.equal(body.accepted, true);
    assertNoSecrets(body, "anyone@example.com");
  });

  it("scrubGuideUpdatesResponse removes email and secret markers", () => {
    const email = "ratchet-qa+scrub@example.com";
    const scrubbed = scrubGuideUpdatesResponse(
      {
        error: {
          code: "X",
          message: `failed for ${email} via postgres://u:p@h/db Traceback psycopg`,
        },
      },
      email,
    );
    assertNoSecrets(scrubbed, email);
  });

  it("isUniqueConstraintError detects postgres 23505 wording", () => {
    assert.equal(
      isUniqueConstraintError(new Error("duplicate key value violates unique constraint")),
      true,
    );
    assert.equal(isUniqueConstraintError(new Error("23505")), true);
    assert.equal(isUniqueConstraintError(new Error("connection refused")), false);
  });
});

describe("readJsonBody", () => {
  it("returns ok for pre-parsed objects", () => {
    const r = readJsonBody({ headers: {}, body: { full_name: "A" } });
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.value, { full_name: "A" });
  });

  it("parses valid JSON strings", () => {
    const r = readJsonBody({ headers: {}, body: '{"full_name":"A"}' });
    assert.equal(r.ok, true);
  });

  it("rejects malformed JSON strings without throwing", () => {
    const r = readJsonBody({ headers: {}, body: "{malformed" });
    assert.equal(r.ok, false);
  });

  it("rejects non-object primitives", () => {
    assert.equal(readJsonBody({ headers: {}, body: 42 }).ok, false);
    assert.equal(readJsonBody({ headers: {}, body: true }).ok, false);
  });

  it("treats body-access throws as malformed", () => {
    const req = {
      headers: {},
      get body() {
        throw new SyntaxError("Unexpected token");
      },
    };
    assert.equal(readJsonBody(req as never).ok, false);
  });
});
