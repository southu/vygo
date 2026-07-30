/**
 * Contract tests for the assessment (/readiness) and apply-form (/apply)
 * conversion paths. Both paths delegate to the SAME shared, consent-gated,
 * deduped emitter the waitlist uses (`createConversionEvent` /
 * `emitConversionEvent`), so these tests exercise the exact event inputs those
 * components produce and assert the resulting payload shape, consent gating,
 * dedup, confirmed-completion, and false-conversion prevention.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildConversionPayload,
  createConversionEmitter,
  type ConversionEventInput,
  type ConversionPayload,
} from "./conversion";

function harness(consent = true) {
  const sent: Array<{ event: string; payload: ConversionPayload }> = [];
  let allowed = consent;
  const emitter = createConversionEmitter({
    hasConsent: () => allowed,
    track: (event, payload) => sent.push({ event, payload }),
  });
  return {
    emitter,
    sent,
    grant: () => {
      allowed = true;
    },
    deny: () => {
      allowed = false;
    },
    countOf: (event: string) => sent.filter((s) => s.event === event).length,
  };
}

// --- exact event inputs each path produces ---------------------------------

/** /apply form — first field interaction / submit attempt. */
const applyFormStart: ConversionEventInput = {
  event: "form_start",
  landingPageId: "apply",
  ctaLocation: null,
  outcome: "started",
  dedupeKey: "apply",
  extra: { form_id: "apply" },
};

const applyValidationError: ConversionEventInput = {
  event: "conversion_error",
  landingPageId: "apply",
  ctaLocation: null,
  outcome: "validation_error",
  extra: { form_id: "apply", error_fields: "fullName,workEmail", error_count: 2 },
};

const applySubmissionRejected: ConversionEventInput = {
  event: "conversion_error",
  landingPageId: "apply",
  ctaLocation: null,
  outcome: "submission_rejected",
  extra: { form_id: "apply", status: 500, code: "unknown" },
};

const applySuccess = (applicationId: string): ConversionEventInput => ({
  event: "conversion_success",
  landingPageId: "apply",
  ctaLocation: null,
  outcome: "success",
  dedupeKey: applicationId,
  extra: { form_id: "apply", status: 201 },
});

/** /readiness assessment — "Start analysis" and scored completion. */
const readinessFormStart = (runId: string): ConversionEventInput => ({
  event: "form_start",
  landingPageId: "readiness",
  ctaLocation: null,
  outcome: "started",
  dedupeKey: runId,
  extra: { form_id: "readiness", mode: "new" },
});

const readinessValidationError: ConversionEventInput = {
  event: "conversion_error",
  landingPageId: "readiness",
  ctaLocation: null,
  outcome: "validation_error",
  extra: { form_id: "readiness", error_fields: "name,email", error_count: 2 },
};

const readinessSubmissionRejected: ConversionEventInput = {
  event: "conversion_error",
  landingPageId: "readiness",
  ctaLocation: null,
  outcome: "submission_rejected",
  extra: { form_id: "readiness", code: "unknown" },
};

const readinessSuccess = (snapshotId: string): ConversionEventInput => ({
  event: "conversion_success",
  landingPageId: "readiness",
  ctaLocation: null,
  outcome: "success",
  dedupeKey: snapshotId,
  extra: { form_id: "readiness" },
});

// --- payload shape ----------------------------------------------------------

test("apply form_start carries the required contract fields", () => {
  const p = buildConversionPayload(applyFormStart);
  assert.equal(p.landing_page_id, "apply");
  assert.equal(p.cta_location, null); // no CTA applies to a form event
  assert.equal(p.conversion_outcome, "started");
  assert.equal(p.form_id, "apply");
});

test("readiness form_start carries the required contract fields", () => {
  const p = buildConversionPayload(readinessFormStart("run-1"));
  assert.equal(p.landing_page_id, "readiness");
  assert.equal(p.cta_location, null);
  assert.equal(p.conversion_outcome, "started");
  assert.equal(p.form_id, "readiness");
});

test("conversion_error payloads distinguish validation vs. rejected submissions", () => {
  assert.equal(buildConversionPayload(applyValidationError).conversion_outcome, "validation_error");
  assert.equal(
    buildConversionPayload(applySubmissionRejected).conversion_outcome,
    "submission_rejected",
  );
  assert.equal(
    buildConversionPayload(readinessValidationError).conversion_outcome,
    "validation_error",
  );
  assert.equal(
    buildConversionPayload(readinessSubmissionRejected).conversion_outcome,
    "submission_rejected",
  );
});

test("allowlisted campaign params ride along on apply/readiness conversion payloads", () => {
  const p = buildConversionPayload({
    ...applySuccess("app-1"),
    params: { utm_source: "google", gclid: "abc" },
  });
  assert.equal(p.utm_source, "google");
  assert.equal(p.gclid, "abc");
  assert.equal(p.conversion_outcome, "success");
});

// --- consent gating ---------------------------------------------------------

test("consent denied: neither the apply nor the readiness path sends any event", () => {
  const h = harness(false);
  h.emitter.emit(applyFormStart);
  h.emitter.emit(applyValidationError);
  h.emitter.emit(applySuccess("app-1"));
  h.emitter.emit(readinessFormStart("run-1"));
  h.emitter.emit(readinessSuccess("snap-1"));
  assert.equal(h.sent.length, 0);
});

test("granting consent after a denied start still lets form_start fire exactly once", () => {
  const h = harness(false);
  assert.equal(h.emitter.emit(applyFormStart), false); // suppressed, not marked
  h.grant();
  assert.equal(h.emitter.emit(applyFormStart), true); // now fires
  assert.equal(h.emitter.emit(applyFormStart), false); // deduped afterwards
  assert.equal(h.countOf("form_start"), 1);
});

// --- confirmed completion + dedup ------------------------------------------

test("apply conversion_success fires once per application id and dedupes retries", () => {
  const h = harness();
  h.emitter.emit(applySuccess("app-123"));
  h.emitter.emit(applySuccess("app-123")); // retried success for same attempt
  assert.equal(h.countOf("conversion_success"), 1);
  h.emitter.emit(applySuccess("app-456")); // genuinely new attempt
  assert.equal(h.countOf("conversion_success"), 2);
});

test("readiness conversion_success fires once per snapshot id (rerender/back-forward safe)", () => {
  const h = harness();
  h.emitter.emit(readinessSuccess("snap-9"));
  h.emitter.emit(readinessSuccess("snap-9"));
  h.emitter.emit(readinessSuccess("snap-9"));
  assert.equal(h.countOf("conversion_success"), 1);
});

test("readiness form_start dedupes per run id but a new run emits a fresh start", () => {
  const h = harness();
  h.emitter.emit(readinessFormStart("run-1"));
  h.emitter.emit(readinessFormStart("run-1")); // repeated Start clicks, same run
  assert.equal(h.countOf("form_start"), 1);
  h.emitter.emit(readinessFormStart("run-2")); // "New analysis" — fresh run id
  assert.equal(h.countOf("form_start"), 2);
});

// --- false-conversion prevention -------------------------------------------

test("apply: form_start + validation error + rejected submission never emit a success", () => {
  const h = harness();
  h.emitter.emit(applyFormStart);
  h.emitter.emit(applyValidationError);
  h.emitter.emit(applyValidationError); // errors are not deduped — each is real
  h.emitter.emit(applySubmissionRejected);
  assert.equal(h.countOf("conversion_success"), 0);
  assert.equal(h.countOf("form_start"), 1);
  assert.equal(h.countOf("conversion_error"), 3);
});

test("readiness: start + failed submissions never emit a success until scored", () => {
  const h = harness();
  h.emitter.emit(readinessFormStart("run-1"));
  h.emitter.emit(readinessValidationError);
  h.emitter.emit(readinessSubmissionRejected);
  assert.equal(h.countOf("conversion_success"), 0);
  // Only a destination-confirmed scored snapshot flips it to success.
  h.emitter.emit(readinessSuccess("snap-1"));
  assert.equal(h.countOf("conversion_success"), 1);
});
