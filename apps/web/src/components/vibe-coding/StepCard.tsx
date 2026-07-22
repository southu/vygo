import type { ReactNode } from "react";

export type Step = {
  /** The single action this card covers. */
  title: string;
  /** Step body — wrap any button/menu/field name in <strong>, nest a Callout,
   * CodeBlock, or GuideScreenshot as needed. */
  body: ReactNode;
};

/**
 * Numbered step-card list for guide procedures. Every multi-step procedure on
 * the how-to guide renders through this component instead of a plain <ol> or
 * run-on paragraph — one card per action, numbered in document order.
 */
export function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="step-list">
      {steps.map((step, index) => (
        <li key={step.title} className="step-card" data-testid="step-card">
          <span className="step-card-number" data-step-number aria-hidden="true">
            {index + 1}
          </span>
          <div className="step-card-content">
            <p className="step-card-title">{step.title}</p>
            <div className="step-card-text">{step.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
