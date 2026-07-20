/**
 * Job-board application validation tests. Covers the required-field and email
 * checks the create-application route enforces server-side (regardless of any
 * client-side checks), including the required resume (link or pasted text).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateApplication, type ApplicationInput } from "./jobs.js";

function base(overrides: Partial<ApplicationInput> = {}): ApplicationInput {
  return {
    name: "  Jordan Lee  ",
    email: " jordan@example.com ",
    resume: " https://example.com/jordan.pdf ",
    ...overrides,
  };
}

describe("validateApplication", () => {
  it("accepts a complete submission and trims fields", () => {
    const result = validateApplication(base({ coverNote: "  Excited to apply  " }));
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.name, "Jordan Lee");
      assert.equal(result.email, "jordan@example.com");
      assert.equal(result.resume, "https://example.com/jordan.pdf");
      assert.equal(result.coverNote, "Excited to apply");
    }
  });

  it("accepts pasted resume text (not only a URL)", () => {
    const result = validateApplication(base({ resume: "10 years building TypeScript systems." }));
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.resume, "10 years building TypeScript systems.");
  });

  it("rejects a missing name", () => {
    const result = validateApplication(base({ name: "   " }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /name/i);
  });

  it("rejects a missing email", () => {
    const result = validateApplication(base({ email: "" }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /email/i);
  });

  it("rejects a malformed email", () => {
    const result = validateApplication(base({ email: "not-an-email" }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /email/i);
  });

  it("rejects a missing resume", () => {
    const result = validateApplication(base({ resume: "   " }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /resume/i);
  });

  it("treats coverNote as optional", () => {
    const result = validateApplication(base());
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.coverNote, null);
  });
});
