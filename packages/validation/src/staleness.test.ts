import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeStaleness,
  resolveLastRefresh,
  windowToken,
  type StalenessInput,
} from "./staleness.js";

/**
 * The cadence limits used across these tests mirror the shipped defaults in
 * config/learnings-cadence.json (threshold N = 5 pending, window M = 30 days).
 * The three named states below are exactly the states the live fire-then-clear
 * demonstration records: over-threshold, over-window, and cleared.
 */
const THRESHOLD = 5;
const WINDOW_DAYS = 30;
const NOW = "2026-07-22T12:00:00.000Z";

/** A fresh refresh well inside the window (1 day ago). */
const FRESH_REFRESH = "2026-07-21T12:00:00.000Z";
/** A refresh comfortably OLDER than the 30-day window (45 days ago). */
const OLD_REFRESH = "2026-06-07T12:00:00.000Z";

function base(overrides: Partial<StalenessInput> = {}): StalenessInput {
  return {
    pendingCount: 0,
    threshold: THRESHOLD,
    lastRefresh: FRESH_REFRESH,
    windowDays: WINDOW_DAYS,
    now: NOW,
    ...overrides,
  };
}

test("over-threshold: stale when pending EXCEEDS the configured threshold", () => {
  // 6 pending > threshold 5, refresh is fresh ⇒ stale for the pending reason only.
  const status = computeStaleness(base({ pendingCount: THRESHOLD + 1 }));

  assert.equal(status.stale, true);
  assert.deepEqual(status.reasons, ["pending-over-threshold"]);
  assert.equal(status.pending_count, 6);
  assert.equal(status.threshold, THRESHOLD);
  assert.equal(status.window, "P30D");
  assert.equal(status.window_days, WINDOW_DAYS);
  assert.equal(status.last_refresh, FRESH_REFRESH);
  // stale is exactly reasons non-empty.
  assert.equal(status.stale, status.reasons.length > 0);

  // Exactly AT the threshold is NOT stale — the limit must be exceeded.
  const atLimit = computeStaleness(base({ pendingCount: THRESHOLD }));
  assert.equal(atLimit.stale, false);
  assert.deepEqual(atLimit.reasons, []);
});

test("over-window: stale when the guide's last refresh is older than the window", () => {
  // Pending under threshold, but the last refresh is 45 days ago (> 30d window).
  const status = computeStaleness(base({ pendingCount: 1, lastRefresh: OLD_REFRESH }));

  assert.equal(status.stale, true);
  assert.deepEqual(status.reasons, ["guide-over-window"]);
  assert.equal(status.last_refresh, OLD_REFRESH);
  assert.equal(status.stale, status.reasons.length > 0);

  // A never-refreshed guide (null) is treated as over-window too.
  const never = computeStaleness(base({ pendingCount: 0, lastRefresh: null }));
  assert.equal(never.stale, true);
  assert.deepEqual(never.reasons, ["guide-over-window"]);
});

test("cleared: not stale when both limits are back under their configured values", () => {
  // Pending at/under threshold AND a fresh refresh ⇒ signal cleared automatically.
  const status = computeStaleness(base({ pendingCount: 2, lastRefresh: FRESH_REFRESH }));

  assert.equal(status.stale, false);
  assert.deepEqual(status.reasons, []);
  assert.equal(status.pending_count, 2);
  assert.equal(status.stale, status.reasons.length > 0);
});

test("both limits crossed reports both reasons, pending first", () => {
  const status = computeStaleness(base({ pendingCount: THRESHOLD + 3, lastRefresh: OLD_REFRESH }));
  assert.equal(status.stale, true);
  assert.deepEqual(status.reasons, ["pending-over-threshold", "guide-over-window"]);
});

test("resolveLastRefresh picks the newest incorporated updated timestamp", () => {
  const entries = [
    {
      status: "incorporated",
      updated: "2026-07-01T00:00:00.000Z",
      incorporated_date: "2026-07-01",
    },
    { status: "pending-in-guide", updated: "2026-07-20T00:00:00.000Z" },
    {
      status: "incorporated",
      updated: "2026-07-10T09:30:00.000Z",
      incorporated_date: "2026-07-10",
    },
  ];
  assert.equal(resolveLastRefresh(entries), "2026-07-10T09:30:00.000Z");

  // No incorporated entries ⇒ null (never refreshed).
  assert.equal(resolveLastRefresh([{ status: "pending-in-guide", updated: "x" }]), null);
});

test("windowToken renders a whole-day ISO-8601 duration", () => {
  assert.equal(windowToken(30), "P30D");
  assert.equal(windowToken(7), "P7D");
});
