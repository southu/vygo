"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  formatEvidenceAnswer,
  hasChartEvidence,
  type ChartEvidence,
} from "./types";

export type EvidenceTooltipCardProps = {
  score: number;
  evidence: ChartEvidence;
  title?: string;
  id?: string;
  className?: string;
};

/**
 * Styled evidence card: numeric score, plain-English reason, and the prospect's
 * actual answer. Renders only real evidence fields — no placeholders.
 */
export function EvidenceTooltipCard({
  score,
  evidence,
  title,
  id,
  className,
}: EvidenceTooltipCardProps) {
  const answer = formatEvidenceAnswer(evidence.answer_value);
  const rounded = Math.round(score);
  const summary = `Scored ${rounded} — ${evidence.reason.trim()}`;

  return (
    <div
      id={id}
      role="tooltip"
      className={`chart-evidence-tooltip card border border-border bg-surface p-3 shadow-card ${className ?? ""}`}
      data-testid="chart-evidence-tooltip"
      data-question-id={evidence.question_id}
    >
      {title ? (
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{title}</p>
      ) : null}
      <p
        className="mt-0.5 font-display text-sm font-bold tabular-nums text-ink"
        data-testid="chart-evidence-score"
      >
        Score {rounded}
        <span className="ml-1 text-xs font-semibold text-muted">/100</span>
      </p>
      <p
        className="mt-1.5 text-xs leading-snug text-ink-soft"
        data-testid="chart-evidence-reason"
      >
        {evidence.reason.trim()}
      </p>
      {answer ? (
        <p
          className="mt-2 rounded-lg border border-border/80 bg-canvas px-2 py-1.5 text-xs leading-snug text-ink"
          data-testid="chart-evidence-answer"
        >
          <span className="font-semibold text-muted">Your answer: </span>
          {answer}
        </p>
      ) : null}
      {/* Compact single-line summary for machine/readers that expect one string */}
      <p className="sr-only" data-testid="chart-evidence-summary">
        {summary}
        {answer ? ` Answer: ${answer}` : ""}
      </p>
    </div>
  );
}

type InteractiveChartSegmentProps = {
  /** Score shown in the tooltip (0–100). */
  score: number;
  evidence?: ChartEvidence | null;
  /** Optional short label used in aria and tooltip title. */
  label?: string;
  className?: string;
  /** Extra attributes for the interactive control (data-testid, etc.). */
  controlClassName?: string;
  /** Visual children of the segment (bar fill, point, arc label, …). */
  children: ReactNode;
  /** Where the tooltip anchors relative to the control. */
  tooltipPlacement?: "top" | "bottom";
  /** Machine-readable segment kind for tests. */
  segmentKind?: "radar-axis" | "gauge-segment" | "sub-metric-bar";
  /** Optional test id on the interactive control. */
  testId?: string;
};

/**
 * Wraps a chart segment with hover / focus / tap evidence tooltips.
 * When evidence is missing, renders children only — no affordance, no tooltip.
 */
export function InteractiveChartSegment({
  score,
  evidence,
  label,
  className,
  controlClassName,
  children,
  tooltipPlacement = "top",
  segmentKind,
  testId,
}: InteractiveChartSegmentProps) {
  const tipId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const hasEvidence = hasChartEvidence(evidence);
  /** Fine-pointer + hover: use hover open; coarse/touch: toggle on tap. */
  const fineHover =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  const close = useCallback(() => setOpen(false), []);
  const openTip = useCallback(() => {
    if (hasEvidence) setOpen(true);
  }, [hasEvidence]);

  // Outside click/tap dismiss (mobile + desktop).
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent | TouchEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const target = event.target as Node | null;
      if (target && !root.contains(target)) close();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [open, close]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      (event.currentTarget as HTMLElement).blur();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (hasEvidence) setOpen((v) => !v);
    }
  };

  if (!hasEvidence) {
    return <div className={className}>{children}</div>;
  }

  const placementClass =
    tooltipPlacement === "bottom"
      ? "chart-evidence-tooltip-anchor-bottom"
      : "chart-evidence-tooltip-anchor-top";

  return (
    <div
      ref={rootRef}
      className={`chart-segment-interactive relative ${className ?? ""}`}
      data-chart-segment={segmentKind}
      data-has-evidence="true"
    >
      <div
        role="button"
        tabIndex={0}
        className={`chart-segment-control outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple ${controlClassName ?? ""}`}
        aria-label={
          label
            ? `${label}, score ${Math.round(score)}. Show evidence.`
            : `Score ${Math.round(score)}. Show evidence.`
        }
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        data-testid={testId}
        data-chart-interactive="true"
        onMouseEnter={() => {
          if (fineHover) openTip();
        }}
        onMouseLeave={() => {
          if (fineHover) close();
        }}
        onFocus={openTip}
        onBlur={(e) => {
          // Keep open when focus moves into the tooltip (rare); otherwise close.
          const next = e.relatedTarget as Node | null;
          if (next && rootRef.current?.contains(next)) return;
          close();
        }}
        onClick={(e) => {
          e.stopPropagation();
          // Desktop hover already shows the card; only toggle for touch / coarse pointers.
          if (fineHover) {
            openTip();
            return;
          }
          setOpen((v) => !v);
        }}
        onKeyDown={onKeyDown}
      >
        {children}
        {/* Discoverability: pulse ring + info dot (only when real evidence exists) */}
        <span className="chart-segment-affordance" aria-hidden data-testid="chart-segment-affordance">
          <span className="chart-segment-pulse" />
          <span className="chart-segment-info-dot" />
        </span>
      </div>
      {open ? (
        <div className={`chart-evidence-tooltip-anchor ${placementClass}`} aria-hidden={false}>
          <EvidenceTooltipCard
            id={tipId}
            score={score}
            evidence={evidence}
            title={label}
          />
        </div>
      ) : null}
    </div>
  );
}
