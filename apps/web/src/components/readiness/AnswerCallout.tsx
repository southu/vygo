"use client";

import type { AnswerCalloutPayload } from "@/lib/readiness/answer-callouts";

type AnswerCalloutProps = {
  callout: AnswerCalloutPayload | null;
  className?: string;
};

/**
 * Lightweight answer-reactive callout. Purely presentational — never disables
 * parent controls. Uses CSS enter animation (fade + slide).
 */
export function AnswerCallout({ callout, className = "" }: AnswerCalloutProps) {
  if (!callout?.text) return null;

  return (
    <div
      key={callout.id + callout.text}
      className={`assessment-answer-callout ${className}`.trim()}
      role="status"
      aria-live="polite"
      data-testid="assessment-answer-callout"
      data-callout-id={callout.id}
      data-callout-text={callout.text}
      data-callout-animated="true"
    >
      <span className="assessment-answer-callout-accent" aria-hidden />
      <p
        className="assessment-answer-callout-text text-sm leading-relaxed text-ink-soft"
        data-testid="assessment-answer-callout-text"
      >
        {callout.text}
      </p>
    </div>
  );
}
