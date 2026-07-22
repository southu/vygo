import type { StalenessStatus } from "@vygo/validation";

/**
 * Staleness badge for the guide-progress view. Renders a stable element with
 * id="staleness-badge" that is ALWAYS present in static page source and carries
 * data-stale="true" | "false". It is only visually active (amber) when stale;
 * when clear it renders in a muted "fresh" style. The stale value comes from the
 * same source as GET /api/staleness, so the attribute always matches the
 * endpoint. The signal clears automatically once both limits are back under
 * their configured values — there is no manual reset.
 */
const REASON_LABELS: Record<string, string> = {
  "pending-over-threshold": "pending learnings over threshold",
  "guide-over-window": "guide refresh over window",
};

export function StalenessBadge({ status }: { status: StalenessStatus }) {
  const stale = status.stale;
  const detail = stale
    ? `Stale: ${status.reasons.map((r) => REASON_LABELS[r] ?? r).join("; ")}. ` +
      `Pending ${status.pending_count}/${status.threshold}, window ${status.window}.`
    : `Fresh: ${status.pending_count}/${status.threshold} pending, refreshed within ${status.window}.`;

  return (
    <span
      id="staleness-badge"
      data-stale={stale ? "true" : "false"}
      data-reasons={status.reasons.join(",")}
      data-pending-count={status.pending_count}
      data-threshold={status.threshold}
      role="status"
      aria-live="polite"
      title={detail}
      className={
        stale
          ? "chip border-amber/50 bg-amber/15 font-semibold text-amber-dark"
          : "chip border-green/40 bg-green/10 font-semibold text-green-dark"
      }
    >
      <span aria-hidden="true">{stale ? "● " : "○ "}</span>
      {stale ? "Guide stale" : "Guide fresh"}
    </span>
  );
}
