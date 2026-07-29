import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FIXTURE_CHAT_WRAPPED,
  FIXTURE_CLEAN,
  FIXTURE_FENCED,
  FIXTURE_MISSING_FOOTER,
  GOLDEN_CLEAN_FIELDS,
} from "./fixtures/golden-pastes.js";
import {
  READINESS_PASTE_VALIDATION_MESSAGES,
  readinessPasteValidationMessage,
  validateReadinessReportPaste,
} from "./paste-validation.js";
import { READINESS_REPORT_V1_END, READINESS_REPORT_V1_START } from "./report-schema.js";

// --- Placeholder / empty content is rejected (never creates findings) --------

test("placeholder 'Analysis completed.' is rejected as missing the begin marker", () => {
  const result = validateReadinessReportPaste("Analysis completed.");
  assert.equal(result.valid, false);
  assert.equal(result.valid === false && result.reason, "missing-begin-marker");
});

test("empty / whitespace-only paste is rejected as empty", () => {
  for (const raw of ["", "   ", "\n\t\n"]) {
    const result = validateReadinessReportPaste(raw);
    assert.equal(result.valid, false);
    assert.equal(result.valid === false && result.reason, "empty");
  }
});

test("non-string input is rejected as empty and never throws", () => {
  for (const raw of [null, undefined, 42, {}]) {
    const result = validateReadinessReportPaste(raw);
    assert.equal(result.valid, false);
    assert.equal(result.valid === false && result.reason, "empty");
  }
});

// --- Missing begin marker ----------------------------------------------------

test("report-like content without the begin marker is rejected", () => {
  // A full report body but with the begin marker line stripped away.
  const noBegin = FIXTURE_CLEAN.replace(`${READINESS_REPORT_V1_START}\n`, "");
  assert.ok(!noBegin.includes(READINESS_REPORT_V1_START));
  assert.ok(noBegin.includes(READINESS_REPORT_V1_END));
  const result = validateReadinessReportPaste(noBegin);
  assert.equal(result.valid, false);
  assert.equal(result.valid === false && result.reason, "missing-begin-marker");
});

// --- Missing end marker (truncated report) -----------------------------------

test("report-like content without the end marker is rejected (not footer-fabricated)", () => {
  // FIXTURE_MISSING_FOOTER has the begin marker and fields but no end marker.
  assert.ok(FIXTURE_MISSING_FOOTER.includes(READINESS_REPORT_V1_START));
  assert.ok(!FIXTURE_MISSING_FOOTER.includes(READINESS_REPORT_V1_END));
  const result = validateReadinessReportPaste(FIXTURE_MISSING_FOOTER);
  assert.equal(result.valid, false);
  assert.equal(result.valid === false && result.reason, "missing-end-marker");
});

// --- Marker-delimited but schema-invalid -------------------------------------

test("a marker-delimited report missing a required field is rejected as schema-invalid", () => {
  // Both markers present, but drop a required field (confidence) → schema fails.
  const body = FIXTURE_CLEAN.split("\n").filter((line) => !line.startsWith("confidence:"));
  const invalid = body.join("\n");
  assert.ok(invalid.includes(READINESS_REPORT_V1_START));
  assert.ok(invalid.includes(READINESS_REPORT_V1_END));
  const result = validateReadinessReportPaste(invalid);
  assert.equal(result.valid, false);
  assert.equal(result.valid === false && result.reason, "schema-invalid");
});

// --- Valid, complete marker-delimited report is accepted ---------------------

test("a complete marker-delimited report is accepted and parses to structured findings", () => {
  const result = validateReadinessReportPaste(FIXTURE_CLEAN);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.equal(result.report.summary, GOLDEN_CLEAN_FIELDS.summary);
    assert.equal(result.report.confidence, GOLDEN_CLEAN_FIELDS.confidence);
  }
});

test("a valid report wrapped in chat prose or a markdown fence is still accepted", () => {
  for (const fixture of [FIXTURE_CHAT_WRAPPED, FIXTURE_FENCED]) {
    const result = validateReadinessReportPaste(fixture);
    assert.equal(result.valid, true);
    assert.equal(result.valid === true && result.report.summary, GOLDEN_CLEAN_FIELDS.summary);
  }
});

// --- Messages ----------------------------------------------------------------

test("every invalid reason maps to a non-empty recoverable message", () => {
  for (const reason of [
    "empty",
    "missing-begin-marker",
    "missing-end-marker",
    "schema-invalid",
  ] as const) {
    const message = readinessPasteValidationMessage(reason);
    assert.equal(message, READINESS_PASTE_VALIDATION_MESSAGES[reason]);
    assert.ok(message.length > 0);
  }
});
