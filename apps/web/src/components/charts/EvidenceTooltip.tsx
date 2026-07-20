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
import { formatEvidenceAnswer, hasChartEvidence, type ChartEvidence } from "./types";

export type EvidenceTooltipCardProps = {
  score: number;
  evidence: ChartEvidence;
  title?: string;
  /** Name of the top critical risk factor (e.g. the binding sub-metric). */
  riskFactor?: string;
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
  riskFactor,
  id,
  className,
}: EvidenceTooltipCardProps) {
  const answer = formatEvidenceAnswer(evidence.answer_value);
  const rounded = Math.round(score);
  const risk = riskFactor?.trim();
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
      {risk ? (
        <p
          className="mt-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-red"
          data-testid="chart-evidence-risk-factor"
        >
          <span className="text-muted">Top critical risk: </span>
          {risk}
        </p>
      ) : null}
      <p className="mt-1.5 text-xs leading-snug text-ink-soft" data-testid="chart-evidence-reason">
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
        {risk ? `Top critical risk: ${risk}. ` : ""}
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
  /** Name of the top critical risk factor shown in the tooltip. */
  riskFactor?: string;
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
  /**
   * Optional side-effect fired on click/tap of the control (e.g. smooth-scroll
   * to a deep-dive section). Runs in addition to — never instead of — the
   * hover/focus/tap tooltip behavior, so tooltips keep working unchanged.
   */
  onActivate?: () => void;
};

function useFineHover(): boolean {
  const [fineHover, setFineHover] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const apply = () => setFineHover(mq.matches);
    apply();
    // Safari < 14 uses addListener; modern browsers use addEventListener.
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
    mq.addListener(apply);
    return () => mq.removeListener(apply);
  }, []);

  return fineHover;
}

/**
 * Wraps a chart segment with hover / focus / tap evidence tooltips.
 * When evidence is missing, renders children only — no affordance, no tooltip.
 */
export function InteractiveChartSegment({
  score,
  evidence,
  label,
  riskFactor,
  className,
  controlClassName,
  children,
  tooltipPlacement = "top",
  segmentKind,
  testId,
  onActivate,
}: InteractiveChartSegmentProps) {
  const tipId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  /** Touch path: focus opens the tip, then a synthetic click would toggle it closed. */
  const ignoreNextClickRef = useRef(false);
  const [open, setOpen] = useState(false);
  const hasEvidence = hasChartEvidence(evidence);
  /** Fine-pointer + hover: open on hover; coarse/touch: toggle on tap. */
  const fineHover = useFineHover();

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

  // Escape closes even when focus is not on the control (document capture).
  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
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
      onActivate?.();
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
        onFocus={() => {
          openTip();
          // On touch/coarse devices, focus is followed by a click that would
          // toggle the tip closed — swallow that one click.
          if (!fineHover) ignoreNextClickRef.current = true;
        }}
        onBlur={(e) => {
          // Keep open when focus moves into the tooltip (rare); otherwise close.
          const next = e.relatedTarget as Node | null;
          if (next && rootRef.current?.contains(next)) return;
          ignoreNextClickRef.current = false;
          close();
        }}
        onClick={(e) => {
          e.stopPropagation();
          // Fire the activation side-effect (e.g. smooth-scroll) on every real
          // click/tap, independent of the tooltip open/close bookkeeping below.
          onActivate?.();
          // Desktop hover already shows the card; click keeps it open.
          if (fineHover) {
            openTip();
            return;
          }
          // Touch: first click after focus is a no-op (tip already open).
          // Second tap (already focused) toggles closed; tap elsewhere dismisses.
          if (ignoreNextClickRef.current) {
            ignoreNextClickRef.current = false;
            openTip();
            return;
          }
          setOpen((v) => !v);
        }}
        onKeyDown={onKeyDown}
      >
        {children}
        {/* Discoverability: pulse ring + info dot (only when real evidence exists) */}
        <span
          className="chart-segment-affordance"
          aria-hidden
          data-testid="chart-segment-affordance"
        >
          <span className="chart-segment-pulse" />
          <span
            className="chart-segment-info-dot animate-pulse"
            data-testid="chart-segment-info-dot"
          />
        </span>
      </div>
      {open ? (
        <div className={`chart-evidence-tooltip-anchor ${placementClass}`} aria-hidden={false}>
          <EvidenceTooltipCard
            id={tipId}
            score={score}
            evidence={evidence}
            title={label}
            riskFactor={riskFactor}
          />
        </div>
      ) : null}
    </div>
  );
}
