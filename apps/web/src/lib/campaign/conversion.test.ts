import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildConversionPayload,
  CAMPAIGN_CONVERSION_EVENTS,
  createConversionEmitter,
  dedupeKeyFor,
  resolveLandingPageId,
  type ConversionEventInput,
  type ConversionPayload,
} from "./conversion";

function input(overrides: Partial<ConversionEventInput> = {}): ConversionEventInput {
  return {
    event: "landing_page_view",
    landingPageId: "student-success",
    ctaLocation: null,
    outcome: "view",
    params: {},
    ...overrides,
  };
}

// --- event contract ---------------------------------------------------------

test("the five stable conversion event names are defined", () => {
  assert.deepEqual(
    [...CAMPAIGN_CONVERSION_EVENTS],
    [
      "landing_page_view",
      "primary_cta_activation",
      "form_start",
      "conversion_error",
      "conversion_success",
    ],
  );
});

// --- payload shape ----------------------------------------------------------

test("every payload carries landing_page_id, cta_location, and conversion_outcome", () => {
  const payload = buildConversionPayload(input());
  assert.equal(payload.landing_page_id, "student-success");
  assert.equal(payload.cta_location, null); // explicit null when no CTA applies
  assert.equal(payload.conversion_outcome, "view");
});

test("cta_location is the stable string for CTA activations", () => {
  const payload = buildConversionPayload(
    input({ event: "primary_cta_activation", ctaLocation: "hero_primary", outcome: "activated" }),
  );
  assert.equal(payload.cta_location, "hero_primary");
  assert.equal(payload.conversion_outcome, "activated");
});

test("allowlisted campaign parameters are spread as top-level payload keys", () => {
  const payload = buildConversionPayload(input({ params: { utm_source: "google", gclid: "G" } }));
  assert.equal(payload.utm_source, "google");
  assert.equal(payload.gclid, "G");
});

test("extra non-PII metadata is merged into the payload", () => {
  const payload = buildConversionPayload(
    input({ event: "conversion_error", outcome: "validation_error", extra: { error_count: 2 } }),
  );
  assert.equal(payload.error_count, 2);
});

// --- dedup keys -------------------------------------------------------------

test("landing views and successes/starts are dedup-keyed; activations and errors are not", () => {
  assert.equal(dedupeKeyFor(input()), "landing_page_view:student-success");
  assert.equal(
    dedupeKeyFor(input({ event: "form_start", outcome: "started", dedupeKey: "lead" })),
    "form_start:student-success:lead",
  );
  assert.equal(
    dedupeKeyFor(input({ event: "conversion_success", outcome: "success", dedupeKey: "app-1" })),
    "conversion_success:student-success:app-1",
  );
  assert.equal(
    dedupeKeyFor(input({ event: "primary_cta_activation", outcome: "activated" })),
    null,
  );
  assert.equal(
    dedupeKeyFor(input({ event: "conversion_error", outcome: "validation_error" })),
    null,
  );
});

// --- emitter: consent gating + dedup ---------------------------------------

function harness(consent: boolean) {
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
  };
}

test("consent denied: no analytics event is sent", () => {
  const { emitter, sent } = harness(false);
  assert.equal(emitter.emit(input()), false);
  assert.equal(sent.length, 0);
});

test("consent granted: the event is sent exactly once", () => {
  const { emitter, sent } = harness(true);
  assert.equal(emitter.emit(input()), true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.event, "landing_page_view");
});

test("landing_page_view is deduped across rerenders / repeated binding", () => {
  const { emitter, sent } = harness(true);
  emitter.emit(input());
  emitter.emit(input());
  emitter.emit(input());
  assert.equal(sent.length, 1);
});

test("conversion_success is deduped per attempt but distinct attempts each count", () => {
  const { emitter, sent } = harness(true);
  const success = input({ event: "conversion_success", outcome: "success", dedupeKey: "app-1" });
  emitter.emit(success);
  emitter.emit(success); // retry of the same completed attempt — suppressed
  emitter.emit(input({ event: "conversion_success", outcome: "success", dedupeKey: "app-2" }));
  assert.equal(sent.filter((s) => s.event === "conversion_success").length, 2);
});

test("CTA activations are not deduped — each activation is its own signal", () => {
  const { emitter, sent } = harness(true);
  const activation = input({
    event: "primary_cta_activation",
    ctaLocation: "hero_primary",
    outcome: "activated",
  });
  emitter.emit(activation);
  emitter.emit(activation);
  assert.equal(sent.length, 2);
});

test("a view suppressed under denied consent still fires once when consent is granted", () => {
  const h = harness(false);
  assert.equal(h.emitter.emit(input()), false); // denied → not marked emitted
  h.grant();
  assert.equal(h.emitter.emit(input()), true); // now allowed → fires
  assert.equal(h.emitter.emit(input()), false); // and stays deduped afterwards
  assert.equal(h.sent.length, 1);
});

// --- landing_page_id resolution --------------------------------------------

test("resolveLandingPageId derives a stable id from the pathname", () => {
  assert.equal(resolveLandingPageId("/campaign/student-success"), "student-success");
  assert.equal(resolveLandingPageId("/campaign/student-success?utm_source=x"), "student-success");
  assert.equal(resolveLandingPageId("/waitlist"), "waitlist");
  assert.equal(resolveLandingPageId("/"), "home");
  assert.equal(resolveLandingPageId("/readiness/snapshot"), "readiness:snapshot");
});
