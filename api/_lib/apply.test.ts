/**
 * Apply-form validation tests (no database).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isPlausibleWorkEmail, parseApplyBody } from "./apply.js";

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
      assert.equal(result.body.error && (result.body.error as { code?: string }).code, "VALIDATION_ERROR");
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
      assert.equal(result.body.error && (result.body.error as { code?: string }).code, "VALIDATION_ERROR");
      assert.equal("id" in result.body, false);
    }
  });
});
