/**
 * Job-board application validation tests. Covers the required-field and email
 * checks the create-application route enforces server-side (regardless of any
 * client-side checks), including the required resume (link or pasted text).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  countApplicationsByRole,
  createApplication,
  getApplication,
  listApplications,
  updateApplicationStatus,
  validateApplication,
  type ApplicationInput,
} from "./jobs.js";

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

describe("application review lifecycle", () => {
  it("creates, reads, lists by role, counts, and advances status", () => {
    const roleId = `test-role-${Math.floor(Math.random() * 1e9)}`;
    const created = createApplication(roleId, {
      name: "Casey Rivera",
      email: "casey@example.com",
      resume: "https://example.com/casey.pdf",
      coverNote: "Excited to help.",
    });
    assert.equal(created.status, "new");

    const fetched = getApplication(created.id);
    assert.equal(fetched?.name, "Casey Rivera");
    assert.equal(fetched?.email, "casey@example.com");
    assert.equal(fetched?.resume, "https://example.com/casey.pdf");
    assert.equal(fetched?.cover_note, "Excited to help.");

    const forRole = listApplications(roleId);
    assert.equal(forRole.length, 1);
    assert.equal(forRole[0]?.id, created.id);

    assert.equal(countApplicationsByRole()[roleId], 1);

    const reviewed = updateApplicationStatus(created.id, "reviewed");
    assert.equal(reviewed?.status, "reviewed");
    const decided = updateApplicationStatus(created.id, "decided");
    assert.equal(decided?.status, "decided");
    assert.equal(getApplication(created.id)?.status, "decided");
  });

  it("returns null for an unknown application id", () => {
    assert.equal(getApplication("does-not-exist"), null);
    assert.equal(updateApplicationStatus("does-not-exist", "reviewed"), null);
  });
});
