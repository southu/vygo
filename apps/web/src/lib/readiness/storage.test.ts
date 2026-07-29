import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isPreservableReadinessState,
  isResumableInProgress,
  type ReadinessLocalState,
} from "./storage";

function state(overrides: Partial<ReadinessLocalState>): ReadinessLocalState {
  return {
    token: "session-token",
    stage: "intake",
    stage1: {},
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// isPreservableReadinessState — what survives a ?new=1 clean start as the
// resumable Step-8 snapshot. Only a tokened `confirm` (report_parsed, Step 8)
// session qualifies, so a fresh/intake state can never masquerade as resumable
// and a later gate/score never overwrites the Step-8 findings snapshot.
test("isPreservableReadinessState accepts a tokened confirm (Step 8) session", () => {
  assert.equal(isPreservableReadinessState(state({ stage: "confirm" })), true);
});

test("isPreservableReadinessState rejects a confirm session with no token", () => {
  assert.equal(isPreservableReadinessState(state({ stage: "confirm", token: null })), false);
  assert.equal(isPreservableReadinessState(state({ stage: "confirm", token: "" })), false);
});

test("isPreservableReadinessState rejects clean intake and non-Step-8 stages", () => {
  assert.equal(isPreservableReadinessState(state({ stage: "intake" })), false);
  assert.equal(isPreservableReadinessState(state({ stage: "paste" })), false);
  // gate (Step 9, findings already confirmed) is intentionally excluded so a
  // resume lands back on Step 8 — Confirm findings — not the score gate.
  assert.equal(isPreservableReadinessState(state({ stage: "gate" })), false);
});

test("isPreservableReadinessState rejects null/undefined", () => {
  assert.equal(isPreservableReadinessState(null), false);
  assert.equal(isPreservableReadinessState(undefined), false);
});

// isResumableInProgress — whether the MAIN key already holds an advanced run the
// plain load would resume on its own. Only when it does NOT (e.g. a ?new=1 clean
// intake) does the preserved Step-8 snapshot take over, so a genuine in-progress
// run is never clobbered by an older snapshot.
test("isResumableInProgress is true for every advanced tokened stage", () => {
  for (const stage of ["prompt", "stage2", "paste", "stage3", "confirm", "gate", "scored"]) {
    assert.equal(isResumableInProgress(state({ stage })), true, `stage ${stage}`);
  }
});

test("isResumableInProgress is false for a clean ?new=1 intake", () => {
  // The exact state a ?new=1 clean start leaves in the main key: fresh token,
  // intake stage — so the preserved Step-8 snapshot is what gets resumed.
  assert.equal(isResumableInProgress(state({ stage: "intake" })), false);
});

test("isResumableInProgress is false without a token or state", () => {
  assert.equal(isResumableInProgress(state({ stage: "confirm", token: null })), false);
  assert.equal(isResumableInProgress(null), false);
  assert.equal(isResumableInProgress(undefined), false);
});
