"use client";

type ChartSkeletonProps = {
  /** Which chart area this placeholder reserves space for. */
  kind?: "gauge" | "radar" | "bars" | "hero" | "dimension";
  className?: string;
  label?: string;
};

/**
 * Fixed-geometry loading placeholder for chart areas.
 * Heights intentionally match hydrated chart bounding boxes (including segment
 * chip lists / radar axis chips / sub-metric card grids) so layout does not
 * shift when data arrives.
 */
export function ChartSkeleton({
  kind = "hero",
  className,
  label = "Loading chart…",
}: ChartSkeletonProps) {
  // Reserve approximately final hydrated chart heights (incl. chip lists).
  const minHeight =
    kind === "gauge"
      ? 300
      : kind === "radar"
        ? 400
        : kind === "bars"
          ? 420
          : kind === "dimension"
            ? 280
            : 240;

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
          <div className="h-32 w-52 rounded-t-full border-8 border-b-0 border-border/80 bg-transparent" />
          <div className="h-8 w-16 rounded bg-border/70" />
          <div className="h-3 w-28 rounded bg-border/50" />
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <div className="h-6 w-20 rounded-full bg-border/50" />
            <div className="h-6 w-24 rounded-full bg-border/50" />
            <div className="h-6 w-16 rounded-full bg-border/50" />
          </div>
        </div>
      ) : kind === "radar" ? (
        <div className="relative flex h-full min-h-[inherit] flex-col items-center justify-center gap-4 p-6">
          <div className="aspect-square w-full max-w-[300px] rounded-full border border-dashed border-border/80 bg-surface/40" />
          <div className="flex flex-wrap justify-center gap-2">
            <div className="h-6 w-20 rounded-full bg-border/50" />
            <div className="h-6 w-24 rounded-full bg-border/50" />
            <div className="h-6 w-16 rounded-full bg-border/50" />
            <div className="h-6 w-20 rounded-full bg-border/50" />
            <div className="h-6 w-28 rounded-full bg-border/50" />
          </div>
        </div>
      ) : kind === "bars" ? (
        <div className="relative grid gap-5 p-5 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-xl border border-border/60 bg-surface/40 p-4">
              <div className="h-4 w-1/3 rounded bg-border/60" />
              <div className="h-2.5 w-full rounded-full bg-border/40" />
              <div className="h-2.5 w-4/5 rounded-full bg-border/40" />
              <div className="h-2.5 w-3/5 rounded-full bg-border/40" />
              <div className="h-2.5 w-2/3 rounded-full bg-border/40" />
            </div>
          ))}
        </div>
      ) : kind === "dimension" ? (
        <div className="relative space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="h-3 w-16 rounded bg-border/50" />
              <div className="h-6 w-40 rounded bg-border/60" />
            </div>
            <div className="h-8 w-14 rounded bg-border/60" />
          </div>
          <div className="h-2.5 w-full max-w-md rounded-full bg-border/40" />
          <div className="space-y-2.5 pt-2">
            <div className="h-2.5 w-full rounded-full bg-border/40" />
            <div className="h-2.5 w-5/6 rounded-full bg-border/40" />
            <div className="h-2.5 w-2/3 rounded-full bg-border/40" />
            <div className="h-2.5 w-3/4 rounded-full bg-border/40" />
          </div>
          <div className="mt-3 space-y-2 rounded-xl border border-border/50 bg-surface/30 p-4">
            <div className="h-3 w-28 rounded bg-border/50" />
            <div className="h-3 w-full rounded bg-border/40" />
            <div className="h-3 w-5/6 rounded bg-border/40" />
          </div>
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
