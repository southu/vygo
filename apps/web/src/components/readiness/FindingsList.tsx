/**
 * FINDINGS section for the Readiness "Confirm findings" (Step 8) screen.
 *
 * Renders each finding as a distinct severity-tagged row (NOT a bulleted list):
 *   - a colored severity indicator with a severity-specific icon SHAPE (check /
 *     triangle / octagon / info) plus an accent color — severity is never
 *     conveyed by color alone, and a visually-hidden label announces it to
 *     assistive tech,
 *   - an area label chip (Auth, API, Deploy, Security, …),
 *   - a bold short summary phrase, and
 *   - the full finding text below it in regular weight.
 *
 * Long findings clamp to ~2 lines with an inline "Show more" expander. Rows are
 * ordered severity-first and a count summary sits at the top. Nothing is ever
 * hidden — every finding in the data becomes a row.
 */
"use client";

import { useState, type ReactNode } from "react";
import {
  countBySeverity,
  parseFindings,
  summarizeCounts,
  type FindingSeverity,
} from "@/lib/readiness/findings";

type IconProps = { className?: string };

const svgBase = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/** OK — a check mark. */
function CheckIcon({ className }: IconProps) {
  return (
    <svg {...svgBase} className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="m8 12 3 3 5-6" />
    </svg>
  );
}

/** Warning — a triangle with an exclamation. */
function TriangleAlertIcon({ className }: IconProps) {
  return (
    <svg {...svgBase} className={className}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" x2="12" y1="9" y2="13" />
      <line x1="12" x2="12.01" y1="17" y2="17" />
    </svg>
  );
}

/** Attention/issue — an octagon with an exclamation. */
function OctagonAlertIcon({ className }: IconProps) {
  return (
    <svg {...svgBase} className={className}>
      <path d="M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86z" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </svg>
  );
}

/** Neutral/info — an "i" in a circle. */
function InfoIcon({ className }: IconProps) {
  return (
    <svg {...svgBase} className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

interface SeverityStyle {
  Icon: (props: IconProps) => ReactNode;
  /** Announced to assistive tech. */
  srLabel: string;
  /** Accent color class for the icon (dark enough for AA contrast on surface). */
  iconClass: string;
  /** Indicator ring border color in the accent hue. */
  badgeClass: string;
  /** data attribute value for tests/styling. */
  key: FindingSeverity;
}

const SEVERITY_STYLES: Record<FindingSeverity, SeverityStyle> = {
  attention: {
    key: "attention",
    Icon: OctagonAlertIcon,
    srLabel: "Needs attention",
    iconClass: "text-red",
    badgeClass: "border-red bg-surface",
  },
  warning: {
    key: "warning",
    Icon: TriangleAlertIcon,
    srLabel: "Warning",
    iconClass: "text-amber",
    badgeClass: "border-amber bg-surface",
  },
  ok: {
    key: "ok",
    Icon: CheckIcon,
    srLabel: "OK",
    iconClass: "text-green-dark",
    badgeClass: "border-green-dark bg-surface",
  },
  neutral: {
    key: "neutral",
    Icon: InfoIcon,
    srLabel: "Info",
    iconClass: "text-blue",
    badgeClass: "border-blue bg-surface",
  },
};

/** Longer than this (chars) clamps to ~2 lines behind a Show more control. */
const CLAMP_THRESHOLD = 96;

function FindingRow({
  severity,
  area,
  summary,
  detail,
}: {
  severity: FindingSeverity;
  area: string;
  summary: string;
  detail: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const style = SEVERITY_STYLES[severity];
  const Icon = style.Icon;
  const clampable = detail.length > CLAMP_THRESHOLD;

  return (
    <div
      role="listitem"
      data-testid="finding-row"
      data-severity={style.key}
      className="flex gap-3 rounded-xl border border-border bg-canvas px-3.5 py-3"
    >
      <span
        data-testid="finding-severity-indicator"
        data-severity={style.key}
        aria-label={style.srLabel}
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${style.badgeClass}`}
      >
        <Icon className={`h-4 w-4 ${style.iconClass}`} />
        <span className="sr-only">{style.srLabel}</span>
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            data-testid="finding-area-chip"
            className="chip gap-1 border-border bg-surface text-[0.7rem] font-semibold uppercase tracking-wide text-muted"
          >
            {area}
          </span>
          <p data-testid="finding-summary" className="min-w-0 text-sm font-bold text-ink">
            {summary}
          </p>
        </div>

        <p
          data-testid="finding-detail"
          className={`mt-1 text-sm font-normal text-ink-soft ${
            clampable && !expanded ? "line-clamp-2" : ""
          }`}
        >
          {detail}
        </p>

        {clampable ? (
          <button
            type="button"
            data-testid="finding-show-more"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 text-xs font-semibold text-purple hover:text-purple-dark"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function FindingsList({
  label,
  findings,
  emptyText,
}: {
  label: string;
  findings: string[];
  emptyText: string;
}) {
  const parsed = parseFindings(findings);
  const counts = countBySeverity(parsed);
  const countSummary = summarizeCounts(counts);

  return (
    <div className="readiness-step-panel mt-4" data-testid="readiness-confirm-findings">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="eyebrow">{label}</p>
        {parsed.length > 0 && countSummary ? (
          <p data-testid="findings-count-summary" className="text-xs font-medium text-muted">
            {countSummary}
          </p>
        ) : null}
      </div>

      {parsed.length > 0 ? (
        <div role="list" data-testid="findings-rows" className="mt-3 space-y-2">
          {parsed.map((f, i) => (
            <FindingRow
              key={`${i}-${f.raw}`}
              severity={f.severity}
              area={f.area}
              summary={f.summary}
              detail={f.detail}
            />
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">{emptyText}</p>
      )}
    </div>
  );
}
