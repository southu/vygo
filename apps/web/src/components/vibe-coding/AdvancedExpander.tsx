import type { ReactNode } from "react";

/**
 * Collapsed-by-default "Advanced" expander for supplementary detail, edge
 * cases, and configuration deep-dives. Plain <details>/<summary> so every
 * expander opens and closes independently with no JS required. The
 * page-level Beginner/Expert toggle (GuideModeToggle) drives every
 * [data-advanced-expander] element's `open` property at once from the
 * outside — this component itself has no toggle-all logic, which is what
 * keeps a reader's individual open/close clicks unaffected by the mode
 * toggle.
 */
export function AdvancedExpander({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="advanced-expander" data-advanced-expander>
      <summary className="advanced-expander-summary">
        <span className="advanced-expander-badge">Advanced</span>
        <span className="advanced-expander-title">{title}</span>
        <span className="advanced-expander-icon" aria-hidden="true" />
      </summary>
      <div className="advanced-expander-body">{children}</div>
    </details>
  );
}
