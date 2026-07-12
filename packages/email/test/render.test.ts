import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  renderApplicantConfirmation,
  renderInternalLeadNotification,
  runEmailRenderSuite,
} from "../src/index.js";

describe("@vygo/email render", () => {
  it("renders applicant confirmation with html and non-empty text (normal)", async () => {
    const out = await renderApplicantConfirmation({
      fullName: "Ada",
      companyName: "Co",
      message: "Hello",
    });
    assert.ok(out.html.includes("Ada") || out.html.includes("Application"));
    assert.ok(out.text.trim().length > 0);
    assert.ok(out.subject.length > 0);
  });

  it("renders applicant confirmation with long content", async () => {
    const out = await renderApplicantConfirmation({
      fullName: "Long",
      companyName: "Co",
      message: "m".repeat(15_000),
    });
    assert.ok(out.html.length > 50);
    assert.ok(out.text.trim().length > 0);
  });

  it("renders internal lead notification with html and text (normal + long)", async () => {
    const normal = await renderInternalLeadNotification({
      fullName: "Ada",
      companyName: "Co",
      productUrl: "https://example.com",
      stage: "prototype",
      primaryBlocker: "other",
      desiredStart: "later",
      message: "hi",
      marketingConsent: false,
    });
    assert.ok(normal.html.length > 50);
    assert.ok(normal.text.includes("Marketing consent"));

    const long = await renderInternalLeadNotification({
      fullName: "Ada",
      companyName: "Co",
      productUrl: "https://example.com",
      stage: "prototype",
      primaryBlocker: "other",
      desiredStart: "later",
      message: "y".repeat(15_000),
      marketingConsent: true,
    });
    assert.ok(long.html.length > 50);
    assert.ok(long.text.trim().length > 0);
  });

  it("runEmailRenderSuite passes", async () => {
    const suite = await runEmailRenderSuite();
    assert.equal(suite.ready, true);
  });
});
