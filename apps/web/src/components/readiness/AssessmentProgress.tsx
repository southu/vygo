"use client";

type AssessmentProgressProps = {
  /** 1-based current step */
  current: number;
  /** Total steps in this path */
  total: number;
  /** Optional short stage label (e.g. "Intake") */
  label?: string;
  className?: string;
  /** data-testid override */
  testId?: string;
};

/**
 * Shared progress indicator for every assessment step screen.
 * Shows "Step X of Y" plus a determinate progress bar.
 */
export function AssessmentProgress({
  current,
  total,
  label,
  className = "",
  testId = "assessment-progress",
}: AssessmentProgressProps) {
  const safeTotal = Math.max(1, total);
  const safeCurrent = Math.min(Math.max(1, current), safeTotal);
  const pct = Math.round((safeCurrent / safeTotal) * 100);

  return (
    <div
      className={`assessment-progress ${className}`.trim()}
      data-testid={testId}
      data-step-current={safeCurrent}
      data-step-total={safeTotal}
      role="group"
      aria-label={`Step ${safeCurrent} of ${safeTotal}${label ? ` — ${label}` : ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          className="text-sm font-semibold tabular-nums text-ink"
          data-testid="assessment-progress-label"
        >
          Step {safeCurrent} of {safeTotal}
          {label ? (
            <span className="ml-2 font-medium text-muted">· {label}</span>
          ) : null}
        </p>
        <p className="text-xs font-medium tabular-nums text-muted" aria-hidden>
          {pct}%
        </p>
      </div>
      <div
        className="assessment-progress-track mt-2 h-2 w-full overflow-hidden rounded-full bg-canvas"
        role="progressbar"
        aria-valuenow={safeCurrent}
        aria-valuemin={1}
        aria-valuemax={safeTotal}
        aria-label={`Progress: step ${safeCurrent} of ${safeTotal}`}
        data-testid="assessment-progress-bar"
      >
        <div
          className="assessment-progress-fill h-full rounded-full bg-purple transition-[width] duration-300 ease-out"
          style={{ width: `${Math.max(6, pct)}%` }}
        />
      </div>
    </div>
  );
}
