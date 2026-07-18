"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Collapsed-by-default "Advanced" expander for supplementary detail, edge
 * cases, and configuration deep-dives. Plain <details>/<summary> so every
 * expander opens and closes independently with no JS required to toggle —
 * Enter/Space on the summary works natively. The page-level Beginner/Expert
 * toggle (GuideModeToggle) drives every [data-advanced-expander] element's
 * `open` property at once from the outside — this component itself has no
 * toggle-all logic, which is what keeps a reader's individual open/close
 * clicks unaffected by the mode toggle.
 *
 * The summary's implicit ARIA button role doesn't reliably expose its
 * expanded state as a literal `aria-expanded` DOM attribute across tooling,
 * so a `toggle` listener mirrors `details.open` onto `aria-expanded`
 * explicitly. `toggle` fires for every state change — user click, keyboard
 * activation, and the mode toggle's programmatic `.open` writes — so this
 * stays in sync no matter what changed it.
 */
export function AdvancedExpander({ title, children }: { title: string; children: ReactNode }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const details = detailsRef.current;
    const summary = details?.querySelector("summary");
    if (!details || !summary) return;

    const sync = () => summary.setAttribute("aria-expanded", details.open ? "true" : "false");
    sync();
    details.addEventListener("toggle", sync);
    return () => details.removeEventListener("toggle", sync);
  }, []);

  return (
    <details className="advanced-expander" data-advanced-expander ref={detailsRef}>
      <summary className="advanced-expander-summary">
        <span className="advanced-expander-badge">Advanced</span>
        <span className="advanced-expander-title">{title}</span>
        <span className="advanced-expander-icon" aria-hidden="true" />
      </summary>
      <div className="advanced-expander-body">{children}</div>
    </details>
  );
}
