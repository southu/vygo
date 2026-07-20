/**
 * Progressive-disclosure controls for the /readiness deep dives.
 *
 * These mirror the Evidence Strip "View Submitted Context" and per-dimension
 * "Written analysis" disclosures shipped on the snapshot report, so the main
 * readiness page exercises the SAME progressive-disclosure pattern:
 *
 *  - {@link EvidenceStripDisclosure}: page-level. Synthesized takeaways stay
 *    visible; the toggle reveals the verbatim submitted context (raw answer
 *    quotes). Collapsed content is fully hidden (`hidden`), expanded content is
 *    fully visible with no overflow clipping.
 *  - {@link WrittenAnalysisDisclosure}: per-dimension. The analysis prose is
 *    line-clamped while collapsed and shown in full — with no clipping — once
 *    expanded.
 *
 * Server components build the data (quotes, paragraphs) and pass it in as props;
 * only the tiny toggle state lives on the client.
 */
"use client";

import { useId, useState } from "react";

const TRIGGER_CLASS =
  "mt-3 inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:border-purple hover:text-purple";

export type EvidenceRow = {
  dimension: string;
  /** Short name of the lowest-scoring check driving this takeaway. */
  riskFactor: string;
  score: number;
  /** Verbatim reported answer, revealed behind the toggle. */
  answer: string;
};

/**
 * Page-level Evidence Strip. Each dimension contributes one takeaway (its
 * lowest-scoring check); expanding reveals the exact answer text the assessment
 * was drawn from, quoted verbatim.
 */
export function EvidenceStripDisclosure({ rows }: { rows: EvidenceRow[] }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  if (rows.length === 0) return null;

  return (
    <div
      className="rounded-2xl border border-border bg-surface p-5 shadow-card"
      data-testid="readiness-evidence-strip"
    >
      <p className="eyebrow">Evidence strip</p>
      <h3 className="mt-1 font-display text-lg font-bold tracking-tight text-ink">
        What the assessment leaned on
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        The lowest-scoring check in each dimension. Expand the context below to read the exact
        reported answer each takeaway was drawn from.
      </p>

      <ul className="mt-4 space-y-2" data-testid="readiness-evidence-takeaways">
        {rows.map((row) => (
          <li
            key={`takeaway-${row.dimension}`}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm"
          >
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
              {row.dimension}
            </span>
            <span className="font-semibold text-ink">{row.riskFactor}</span>
            <span className="tabular-nums text-muted">{Math.round(row.score)}/100</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        data-testid="readiness-evidence-toggle"
        data-state={open ? "open" : "closed"}
        className={TRIGGER_CLASS}
      >
        {open ? "Hide submitted context" : "↓ View Submitted Context"}
      </button>

      <div
        id={panelId}
        hidden={!open}
        data-state={open ? "open" : "closed"}
        data-testid="readiness-evidence-panel"
        className="mt-4 space-y-4"
      >
        <p className="text-xs leading-relaxed text-muted">
          The exact reported answers these takeaways were drawn from, quoted verbatim.
        </p>
        {rows.map((row) => (
          <figure key={`quote-${row.dimension}`} className="min-w-0">
            <figcaption className="break-words text-xs font-semibold uppercase tracking-[0.06em] text-muted">
              {row.dimension} · {row.riskFactor}
            </figcaption>
            <blockquote
              className="mt-1 break-words border-l-2 border-border pl-3 text-sm italic leading-relaxed text-ink"
              data-testid="readiness-evidence-quote"
            >
              “{row.answer}”
            </blockquote>
          </figure>
        ))}
      </div>
    </div>
  );
}

/**
 * Per-dimension Written Analysis. Collapsed prose is line-clamped; the toggle
 * reveals every paragraph in full with no clipping.
 */
export function WrittenAnalysisDisclosure({
  dimension,
  paragraphs,
  slug,
}: {
  dimension: string;
  paragraphs: string[];
  slug: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  if (paragraphs.length === 0) return null;

  return (
    <div
      className="mt-4 max-w-prose rounded-2xl border border-border bg-muted-surface px-5 py-4"
      data-testid={`readiness-analysis-${slug}`}
    >
      <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted">
        Written analysis
      </h4>
      <div
        id={panelId}
        data-state={open ? "open" : "closed"}
        data-testid={`readiness-analysis-panel-${slug}`}
        className={open ? "mt-3 space-y-3" : "mt-3 space-y-3 line-clamp-4"}
      >
        {paragraphs.map((para, idx) => (
          <p key={`${dimension}-analysis-${idx}`} className="text-sm leading-relaxed text-ink-soft">
            {para}
          </p>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        data-testid={`readiness-analysis-toggle-${slug}`}
        data-state={open ? "open" : "closed"}
        className={TRIGGER_CLASS}
      >
        {open ? "Show less" : "Show full analysis"}
      </button>
    </div>
  );
}
