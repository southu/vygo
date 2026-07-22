/**
 * Ratchet staleness signal — pure computation for the guide-progress view.
 *
 * The guide is considered STALE when EITHER of the two independent limits is
 * crossed, both read only from the single cadence config file
 * (config/learnings-cadence.json — see {@link ../../config/learnings-cadence.json}):
 *
 *  - `pending-over-threshold`: the count of still-pending learnings EXCEEDS the
 *    configured `staleness_threshold` (strictly greater than N); or
 *  - `guide-over-window`: the guide's last refresh is OLDER than the configured
 *    `refresh_window_days` window (elapsed time >= M days).
 *
 * The signal has no manual reset: `stale` is a pure function of the current
 * pending count, the last-refresh timestamp, and the config, so a publish/refresh
 * that brings both back under their limits clears it automatically on the next
 * computation.
 *
 * This module is INTENTIONALLY free of node:fs / node:path so it can be shared
 * verbatim by the static web build and any API surface; the on-disk reads live
 * in the build script (scripts/generate-staleness.ts) and in the fs-touching
 * learnings-log module.
 */

/** Machine-readable reasons a guide can be stale. Empty array ⇒ not stale. */
export const STALENESS_REASONS = ["pending-over-threshold", "guide-over-window"] as const;
export type StalenessReason = (typeof STALENESS_REASONS)[number];

/** Milliseconds in one day. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Inputs for {@link computeStaleness}. All limits come from the cadence config. */
export interface StalenessInput {
  /** Number of learnings still pending incorporation into the guide. */
  pendingCount: number;
  /** `staleness_threshold` from the cadence config (pending count limit N). */
  threshold: number;
  /** ISO timestamp of the guide's last refresh/publish (null ⇒ never refreshed). */
  lastRefresh: string | null;
  /** `refresh_window_days` from the cadence config (window length M in days). */
  windowDays: number;
  /** Evaluation instant (ISO). Defaults to now. */
  now?: string;
}

/** Machine-readable staleness status; the exact GET /api/staleness body. */
export interface StalenessStatus {
  /** True exactly when {@link reasons} is non-empty. */
  stale: boolean;
  /** Which limits are crossed; empty when clear. */
  reasons: StalenessReason[];
  /** Current pending-learnings count. */
  pending_count: number;
  /** Configured pending-count threshold N. */
  threshold: number;
  /** Guide last-refresh timestamp (ISO). */
  last_refresh: string;
  /** Configured refresh window as an ISO-8601 duration token (e.g. "P30D"). */
  window: string;
  /** Configured refresh window length in days (numeric mirror of {@link window}). */
  window_days: number;
  /** Instant the status was computed (ISO). */
  computed_at: string;
}

/** Compact ISO-8601 duration token for a whole-day window (e.g. 30 ⇒ "P30D"). */
export function windowToken(days: number): string {
  return `P${days}D`;
}

/** Epoch ISO used when the guide has never been refreshed (always over-window). */
const NEVER_REFRESHED = "1970-01-01T00:00:00.000Z";

/**
 * Compute the staleness status from the current pending count, last-refresh
 * timestamp, and the cadence limits. Pure and deterministic: same inputs always
 * yield the same status, so the signal clears automatically once both limits are
 * back under their configured values. `stale` is always exactly
 * `reasons.length > 0`.
 */
export function computeStaleness(input: StalenessInput): StalenessStatus {
  const now = input.now ?? new Date().toISOString();
  const lastRefresh = input.lastRefresh ?? NEVER_REFRESHED;

  const reasons: StalenessReason[] = [];

  // Limit 1 — too many pending learnings (strictly EXCEEDS the threshold).
  if (input.pendingCount > input.threshold) {
    reasons.push("pending-over-threshold");
  }

  // Limit 2 — the guide has not been refreshed within the window.
  const elapsedMs = new Date(now).getTime() - new Date(lastRefresh).getTime();
  if (elapsedMs >= input.windowDays * MS_PER_DAY) {
    reasons.push("guide-over-window");
  }

  return {
    stale: reasons.length > 0,
    reasons,
    pending_count: input.pendingCount,
    threshold: input.threshold,
    last_refresh: lastRefresh,
    window: windowToken(input.windowDays),
    window_days: input.windowDays,
    computed_at: now,
  };
}

/** Minimal learning-entry shape needed to resolve the guide's last refresh. */
export interface RefreshSourceEntry {
  status: string;
  updated?: string;
  incorporated_date?: string;
}

/**
 * Resolve the guide's last-refresh instant (ISO) from the learnings log: the
 * most recent `updated` timestamp among incorporated entries (an incorporation
 * IS a guide refresh). Returns null when nothing has been incorporated yet,
 * which {@link computeStaleness} treats as "never refreshed" (over-window).
 */
export function resolveLastRefresh(entries: RefreshSourceEntry[]): string | null {
  let latest: string | null = null;
  for (const entry of entries) {
    if (entry.status !== "incorporated") continue;
    const stamp = entry.updated ?? entry.incorporated_date;
    if (!stamp) continue;
    if (latest === null || new Date(stamp).getTime() > new Date(latest).getTime()) {
      latest = stamp;
    }
  }
  return latest;
}
