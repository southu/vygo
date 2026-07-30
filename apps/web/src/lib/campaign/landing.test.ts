import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isInstrumentedLandingPath,
  PRIMARY_CTA_SELECTOR,
  resolveCtaLocation,
  slugifyCtaLabel,
} from "./landing";

test("isInstrumentedLandingPath matches campaign landing surfaces", () => {
  assert.equal(isInstrumentedLandingPath("/campaigns"), true);
  assert.equal(isInstrumentedLandingPath("/campaigns/launch-readiness-check"), true);
  assert.equal(isInstrumentedLandingPath("/campaigns/careers-hiring-push"), true);
  assert.equal(isInstrumentedLandingPath("/campaigns/vibe-coding-series"), true);
  assert.equal(isInstrumentedLandingPath("/campaigns/evidence"), true);
});

test("isInstrumentedLandingPath excludes unrelated and self-instrumented routes", () => {
  // The singular /campaign/[slug] route self-instruments through its shell.
  assert.equal(isInstrumentedLandingPath("/campaign/student-success"), false);
  assert.equal(isInstrumentedLandingPath("/"), false);
  assert.equal(isInstrumentedLandingPath("/waitlist"), false);
  assert.equal(isInstrumentedLandingPath("/readiness"), false);
  assert.equal(isInstrumentedLandingPath("/campaigns-archive"), false);
  assert.equal(isInstrumentedLandingPath(""), false);
});

test("slugifyCtaLabel produces a stable, bounded slug", () => {
  assert.equal(slugifyCtaLabel("Save brief"), "save-brief");
  assert.equal(slugifyCtaLabel("  Apply now!  "), "apply-now");
  assert.equal(slugifyCtaLabel("Get the Readiness Check →"), "get-the-readiness-check");
  assert.equal(slugifyCtaLabel(""), "");
  assert.equal(slugifyCtaLabel("x".repeat(200)).length, 60);
});

test("resolveCtaLocation prefers an explicit, stable identifier", () => {
  assert.equal(
    resolveCtaLocation({ ctaLocation: "hero_primary", text: "Apply now" }),
    "hero_primary",
  );
  assert.equal(resolveCtaLocation({ cta: "closing", text: "Apply now" }), "closing");
  assert.equal(resolveCtaLocation({ testid: "waitlist-cta", text: "Apply" }), "waitlist-cta");
});

test("resolveCtaLocation falls back to a non-empty label slug then tag", () => {
  assert.equal(resolveCtaLocation({ text: "Save brief", tag: "BUTTON" }), "save-brief");
  assert.equal(resolveCtaLocation({ text: "   ", tag: "A" }), "a");
  assert.equal(resolveCtaLocation({}), "primary_cta");
});

test("PRIMARY_CTA_SELECTOR targets primary CTA candidates", () => {
  assert.match(PRIMARY_CTA_SELECTOR, /data-cta-location/);
  assert.match(PRIMARY_CTA_SELECTOR, /\.btn-primary/);
});
