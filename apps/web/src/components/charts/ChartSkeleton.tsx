"use client";

type ChartSkeletonProps = {
  /** Which chart area this placeholder reserves space for. */
  kind?: "gauge" | "radar" | "bars" | "hero";
  className?: string;
  label?: string;
};

/**
 * Fixed-geometry loading placeholder for chart areas.
 * Matches hydrated chart bounding boxes so layout does not shift when data arrives.
 */
export function ChartSkeleton({
  kind = "hero",
  className,
  label = "Loading chart…",
}: ChartSkeletonProps) {
  const minHeight =
    kind === "gauge" ? 220 : kind === "radar" ? 320 : kind === "bars" ? 160 : 240;

  return (
    <div
      className={`chart-skeleton relative overflow-hidden rounded-2xl border border-border bg-canvas ${className ?? ""}`}
      style={{ minHeight }}
      role="status"
      aria-busy="true"
      aria-label={label}
      data-testid={`chart-skeleton-${kind}`}
      data-chart-skeleton={kind}
    >
      <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-canvas via-[#f0efe9] to-canvas" />
      {kind === "gauge" ? (
        <div className="relative flex h-full min-h-[inherit] flex-col items-center justify-center gap-3 p-6">
          <div className="h-28 w-48 rounded-t-full border-8 border-b-0 border-border/80 bg-transparent" />
          <div className="h-6 w-16 rounded bg-border/70" />
          <div className="h-3 w-28 rounded bg-border/50" />
        </div>
      ) : kind === "radar" ? (
        <div className="relative flex h-full min-h-[inherit] items-center justify-center p-6">
          <div className="aspect-square w-full max-w-[280px] rounded-full border border-dashed border-border/80 bg-surface/40" />
        </div>
      ) : kind === "bars" ? (
        <div className="relative space-y-3 p-5">
          <div className="h-3 w-1/3 rounded bg-border/60" />
          <div className="h-2.5 w-full rounded-full bg-border/40" />
          <div className="h-2.5 w-4/5 rounded-full bg-border/40" />
          <div className="h-2.5 w-3/5 rounded-full bg-border/40" />
        </div>
      ) : (
        <div className="relative space-y-4 p-6">
          <div className="h-4 w-40 rounded bg-border/60" />
          <div className="h-32 w-full max-w-sm rounded-2xl bg-border/40" />
          <div className="h-3 w-2/3 rounded bg-border/50" />
        </div>
      )}
      <span className="sr-only">{label}</span>
    </div>
  );
}
